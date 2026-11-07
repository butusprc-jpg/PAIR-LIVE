import {database} from './db';

const lockKey=74021601;
export type ResetPreview={epochId:string;rounds:number;entries:number;pendingEntries:number;ocrEvidence:number};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function previewRoundReset():Promise<ResetPreview>{
 const r=await database().query(`SELECT e.id AS epoch_id,
  (SELECT count(*)::int FROM rounds WHERE epoch_id=e.id) AS rounds,
  (SELECT count(*)::int FROM round_entries x JOIN rounds r ON r.id=x.round_id WHERE r.epoch_id=e.id) AS entries,
  (SELECT count(*)::int FROM round_entries x JOIN rounds r ON r.id=x.round_id WHERE r.epoch_id=e.id AND x.status='PENDING') AS pending_entries,
  (SELECT count(*)::int FROM round_ocr_evidence x JOIN rounds r ON r.id=x.round_id WHERE r.epoch_id=e.id) AS ocr_evidence
  FROM round_reset_epochs e ORDER BY e.id DESC LIMIT 1`);
 const row=r.rows[0];if(!row)throw new Error('round_epoch_missing');
 return {epochId:String(row.epoch_id),rounds:Number(row.rounds),entries:Number(row.entries),pendingEntries:Number(row.pending_entries),ocrEvidence:Number(row.ocr_evidence)};
}

export async function resetRoundEpoch(actorId:string,resetKey:string,confirmation:string){
 if(confirmation!=='ยืนยันเริ่มใหม่')throw new Error('confirmation_required');
 if(!uuid.test(actorId)||!uuid.test(resetKey))throw new Error('invalid_reset_request');
 const client=await database().connect();
 try{
  await client.query('BEGIN');
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
  const counts=await client.query(`SELECT
   (SELECT count(*)::int FROM rounds WHERE epoch_id=$1) AS rounds,
   (SELECT count(*)::int FROM round_entries x JOIN rounds r ON r.id=x.round_id WHERE r.epoch_id=$1) AS entries`,[oldId]);
  const row=counts.rows[0];
  if(Number(row.rounds)===0){await client.query('COMMIT');return {epochId:oldId,rounds:0,entries:0,replayed:true}}
  const inserted=await client.query('INSERT INTO round_reset_epochs(reset_key,created_by,archived_rounds,archived_entries) VALUES($1,$2,$3,$4) RETURNING id',[resetKey,actorId,row.rounds,row.entries]);
  const newId=String(inserted.rows[0].id);
  await client.query("INSERT INTO round_audit_logs(actor,action,details) VALUES($1,'ROUND_EPOCH_RESET',jsonb_build_object('previous_epoch',$2::bigint,'new_epoch',$3::bigint,'rounds',$4::int,'entries',$5::int))",[actorId,oldId,newId,row.rounds,row.entries]);
  await client.query('COMMIT');
  return {epochId:newId,rounds:Number(row.rounds),entries:Number(row.entries),replayed:false};
 }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
