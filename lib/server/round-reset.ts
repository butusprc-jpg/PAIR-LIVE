import {Pool,PoolClient} from 'pg';

const lockKey=74021601;
export type ResetPreview={epochId:string;rounds:number;entries:number;pendingEntries:number;ocrEvidence:number};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let resetPool:Pool|undefined;
function resetDatabase(){
 const appUrl=process.env.DATABASE_URL,raw=process.env.ROUND_RESET_DATABASE_URL;
 if(!appUrl||!raw)throw new Error('reset_role_not_configured');
 const app=new URL(appUrl),reset=new URL(raw);
 if(app.protocol!==reset.protocol||app.hostname!==reset.hostname||app.port!==reset.port||app.pathname!==reset.pathname||!app.username||!reset.username||app.username===reset.username)throw new Error('reset_role_not_separate');
 const local=['127.0.0.1','localhost','::1'].includes(reset.hostname);
 return resetPool??=new Pool({connectionString:raw,ssl:local?false:{rejectUnauthorized:true},max:5});
}
function count(value:unknown){const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw new Error('round_count_unavailable');return n}
async function assertResetRole(db:Pool|PoolClient){
 const result=await db.query(`SELECT pg_has_role(current_user,'pair_round_reset_executor','MEMBER') AS permitted,
  r.rolsuper,r.rolbypassrls,
  current_user<>pg_get_userbyid(c.relowner) AS separate_owner
  FROM pg_roles r JOIN pg_class c ON c.oid='round_entries'::regclass WHERE r.rolname=current_user`);
 const role=result.rows[0];
 if(!role?.permitted||role.rolsuper||role.rolbypassrls||!role.separate_owner)throw new Error('reset_role_unavailable');
}
async function readCounts(db:Pool|PoolClient,epochId?:string){
 const result=await db.query('SELECT * FROM round_reset_counts($1::bigint)',[epochId??null]);
 const row=result.rows[0];if(result.rowCount!==1||!row)throw new Error('round_count_unavailable');
 return {epochId:String(row.epoch_id),rounds:count(row.rounds),entries:count(row.entries),pendingEntries:count(row.pending_entries),ocrEvidence:count(row.ocr_evidence)};
}

export async function previewRoundReset(db:Pool=resetDatabase()):Promise<ResetPreview>{await assertResetRole(db);return readCounts(db)}

export async function resetRoundEpoch(actorId:string,resetKey:string,confirmation:string,db:Pool=resetDatabase()){
 if(confirmation!=='ยืนยันเริ่มใหม่')throw new Error('confirmation_required');
 if(!uuid.test(actorId)||!uuid.test(resetKey))throw new Error('invalid_reset_request');
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  await assertResetRole(client);
  const epochLocked=await client.query('SELECT pg_try_advisory_xact_lock($1) AS locked',[74021602]);
  if(!epochLocked.rows[0]?.locked)throw new Error('round_worker_busy');
  const locked=await client.query('SELECT pg_try_advisory_xact_lock($1) AS locked',[lockKey]);
  if(!locked.rows[0]?.locked)throw new Error('round_worker_busy');
  // Serialize a broadcast claim with the epoch change. A claimed in-flight
  // delivery must finish before a reset can be retried.
  await client.query('LOCK TABLE round_line_broadcast_outbox IN SHARE ROW EXCLUSIVE MODE');
  await client.query('LOCK TABLE round_countdown_line_outbox IN SHARE ROW EXCLUSIVE MODE');
  await client.query('LOCK TABLE report_notification_outbox IN SHARE ROW EXCLUSIVE MODE');
  const replay=await client.query('SELECT id,archived_rounds,archived_entries FROM round_reset_epochs WHERE reset_key=$1',[resetKey]);
  if(replay.rows[0]){await client.query('COMMIT');return {epochId:String(replay.rows[0].id),rounds:Number(replay.rows[0].archived_rounds),entries:Number(replay.rows[0].archived_entries),replayed:true}}
  const epoch=await client.query('SELECT id FROM round_reset_epochs ORDER BY id DESC LIMIT 1');
  const oldId=String(epoch.rows[0]?.id||'');if(!oldId)throw new Error('round_epoch_missing');
  const active=await client.query("SELECT id,status FROM rounds WHERE epoch_id=$1 AND status IN ('OPEN','CLOSED') LIMIT 1",[oldId]);
  if(active.rows[0])throw new Error('round_in_progress');
  const sending=await client.query("SELECT o.round_id FROM round_line_broadcast_outbox o JOIN rounds r ON r.id=o.round_id WHERE r.epoch_id=$1 AND o.status='SENDING' LIMIT 1",[oldId]);
  if(sending.rows[0])throw new Error('broadcast_in_progress');
  const countdownSending=await client.query("SELECT o.round_id FROM round_countdown_line_outbox o JOIN rounds r ON r.id=o.round_id WHERE r.epoch_id=$1 AND o.status='SENDING' LIMIT 1",[oldId]);
  if(countdownSending.rows[0])throw new Error('broadcast_in_progress');
  const notifying=await client.query("SELECT o.id FROM report_notification_outbox o JOIN report_notification_events e ON e.event_id=o.event_id WHERE o.status='PROCESSING' AND (e.round_id IS NULL OR EXISTS (SELECT 1 FROM rounds r WHERE r.id=CASE WHEN e.round_id ~ '^[0-9]+$' THEN e.round_id::bigint END AND r.epoch_id=$1)) LIMIT 1",[oldId]);
  if(notifying.rows[0])throw new Error('notification_in_progress');
  const row=await readCounts(client,oldId);
  if(row.rounds===0){await client.query('COMMIT');return {epochId:oldId,rounds:0,entries:0,replayed:true}}
  const inserted=await client.query('INSERT INTO round_reset_epochs(reset_key,created_by,archived_rounds,archived_entries) VALUES($1,$2,$3,$4) RETURNING id',[resetKey,actorId,row.rounds,row.entries]);
  const newId=String(inserted.rows[0].id);
  await client.query("INSERT INTO round_audit_logs(actor,action,details) VALUES($1,'ROUND_EPOCH_RESET',jsonb_build_object('previous_epoch',$2::bigint,'new_epoch',$3::bigint,'rounds',$4::int,'entries',$5::int))",[actorId,oldId,newId,row.rounds,row.entries]);
  await client.query('COMMIT');
  return {epochId:newId,rounds:row.rounds,entries:row.entries,replayed:false};
 }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
