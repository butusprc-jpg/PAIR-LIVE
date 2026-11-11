import type {PoolClient} from 'pg';
import {createHash} from 'node:crypto';
import {database} from '../server/db';
import {RoundError,validateDuration,validateEntry} from './core';
import type {EntryInput,Round} from './core';
import {applyWalletMutationWithClient} from '../../modules/member-wallet/server/postgres';
import {walletPathFromDatabase} from '../server/wallet-cutover';
import {enqueueClosingBroadcast} from '../line/round-broadcast';
import {appliedBusinessSettings,readBusinessSettings,shopStatusAt} from './business-settings';
function asIso(value:unknown){return value instanceof Date?value.toISOString():new Date(String(value)).toISOString()}
function mapRound(row:Record<string,unknown>):Round{return {id:String(row.id),opensAt:asIso(row.opens_at),closesAt:asIso(row.closes_at),durationMinutes:Number(row.duration_minutes),status:row.status as Round['status'],closedAt:row.closed_at?asIso(row.closed_at):null,settledAt:row.settled_at?asIso(row.settled_at):null,resultNumber:row.result_number?String(row.result_number):null}}
export type RoundRuleKey='minEntryPoints'|'maxEntryPoints'|'alertBeforeClose';
export type RoundRules={minEntryPoints:number;maxEntryPoints:number;alertBeforeClose:boolean};
const defaultRules:RoundRules={minEntryPoints:1,maxEntryPoints:1000000,alertBeforeClose:true};
async function readRules(client:PoolClient):Promise<RoundRules>{
 const rows=await client.query("SELECT DISTINCT ON (details->>'key') details->>'key' AS key,details->'to' AS value FROM round_audit_logs WHERE action='ROUND_RULE_CHANGED' ORDER BY details->>'key',id DESC");
 const rules={...defaultRules};
 for(const row of rows.rows){if(row.key==='minEntryPoints')rules.minEntryPoints=Number(row.value);else if(row.key==='maxEntryPoints')rules.maxEntryPoints=Number(row.value);else if(row.key==='alertBeforeClose')rules.alertBeforeClose=row.value===true;}
 return rules;
}
async function appliedRules(client:PoolClient,roundId:string):Promise<RoundRules>{
 const result=await client.query("SELECT details FROM round_audit_logs WHERE round_id=$1 AND action='ROUND_RULES_APPLIED' ORDER BY id DESC LIMIT 1",[roundId]);
 return result.rows[0]?.details??defaultRules;
}
async function mapRoundWithRules(client:PoolClient,row:Record<string,unknown>){const round=mapRound(row);return {...round,alertBeforeClose:(await appliedRules(client,round.id)).alertBeforeClose}}
async function assertConnectedOaInTransaction(client:PoolClient){
 const id=process.env.CONNECTED_LINE_OA_ID,token=process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
 if(!id||!token)throw new RoundError('oa_binding_unverified',503);
 const hash=createHash('sha256').update(token).digest('hex');
 const result=await client.query('SELECT enabled,expires_at>now() AS active,verified_token_hash FROM oa_service_control WHERE line_oa_id=$1 FOR SHARE',[id]);
 if(result.rowCount!==1||!result.rows[0].enabled||!result.rows[0].active||result.rows[0].verified_token_hash!==hash)throw new RoundError('oa_service_inactive',403);
}
async function inTransaction<T>(fn:(client:PoolClient)=>Promise<T>){const client=await database().connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock_shared(74021602)');const result=await fn(client);await client.query('COMMIT');return result}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
async function dbNow(client:PoolClient){const result=await client.query('SELECT clock_timestamp() AS now');return new Date(result.rows[0].now).toISOString()}
async function transition(client:PoolClient){
 const now=await dbNow(client);
 const found=await client.query("SELECT * FROM rounds WHERE epoch_id=current_round_epoch_id() AND status IN ('OPEN','CLOSED','SCANNING','REVIEW_REQUIRED') ORDER BY id DESC LIMIT 1 FOR UPDATE");
 if(!found.rows[0])return {round:null as Round|null,serverTime:now};
 let row=found.rows[0];
 if(row.status==='OPEN'&&(new Date(now)>=new Date(row.closes_at)||row.countdown_ends_at&&!row.countdown_stopped_at&&new Date(now)>=new Date(row.countdown_ends_at))){
  const changed=await client.query("UPDATE rounds SET status='CLOSED',closed_at=clock_timestamp() WHERE id=$1 AND status='OPEN' RETURNING *",[row.id]);row=changed.rows[0];
  await client.query("INSERT INTO round_audit_logs(round_id,actor,action) VALUES($1,'engine','ROUND_CLOSED')",[row.id]);
 }else if(row.status==='CLOSED'){
  const changed=await client.query("UPDATE rounds SET status='SCANNING' WHERE id=$1 AND status='CLOSED' RETURNING *",[row.id]);row=changed.rows[0];
  await client.query("INSERT INTO round_audit_logs(round_id,actor,action) VALUES($1,'engine','AWAITING_SCAN')",[row.id]);
 }
 return {round:await mapRoundWithRules(client,row),serverTime:now};
}
export async function currentRound(){return inTransaction(async client=>transition(client))}
export type RoundMode='manual';
export async function roundSettings(){const result=await database().query('SELECT duration_minutes,updated_at FROM round_settings WHERE id=1');const row=result.rows[0];return {durationMinutes:Number(row?.duration_minutes??5),mode:'manual' as const,updatedAt:row?.updated_at}}
export async function roundRuleSettings(){return inTransaction(readRules)}
export async function updateRoundRule(key:RoundRuleKey,value:number|boolean){
 if(key==='alertBeforeClose'?typeof value!=='boolean':!Number.isInteger(value)||Number(value)<1||Number(value)>1000000)throw new RoundError('invalid_round_rule');
 if(!['minEntryPoints','maxEntryPoints','alertBeforeClose'].includes(key))throw new RoundError('invalid_round_rule');
 return inTransaction(async client=>{
  await client.query('SELECT pg_advisory_xact_lock(74021601)');
  const old=await readRules(client),next={...old,[key]:value};
  if(next.minEntryPoints>next.maxEntryPoints)throw new RoundError('invalid_entry_range');
  if(old[key]!==value)await client.query("INSERT INTO round_audit_logs(actor,action,details) VALUES('internal','ROUND_RULE_CHANGED',jsonb_build_object('key',$1::text,'from',$2::jsonb,'to',$3::jsonb))",[key,JSON.stringify(old[key]),JSON.stringify(value)]);
  return next;
 });
}
export async function tickRoundEngine(_options:{requireLiveForAuto?:boolean;allowAutoStart?:boolean}={}){return inTransaction(async client=>{
  await client.query('SELECT pg_advisory_xact_lock(74021601)');
  const current=await transition(client);
  if(current.round)await enqueueClosingBroadcast(client,current.round,current.serverTime);
  return current;
 })}
export async function startManualRound(adminId:string){
 if(!/^[0-9a-f-]{36}$/i.test(adminId))throw new RoundError('invalid_admin_id',403);
 return inTransaction(async client=>{
  await client.query('SELECT pg_advisory_xact_lock(74021601)');
  await assertConnectedOaInTransaction(client);
  const current=await transition(client);
  if(current.round)throw new RoundError('round_already_active',409);
  const setting=await client.query('SELECT duration_minutes FROM round_settings WHERE id=1 FOR UPDATE');
  const duration=validateDuration(Number(setting.rows[0]?.duration_minutes??5));
  const rules=await readRules(client),business=await readBusinessSettings(client);
  const inserted=await client.query(`WITH t AS (SELECT clock_timestamp() AS now) INSERT INTO rounds(round_date,opens_at,closes_at,duration_minutes,status)
   SELECT (t.now AT TIME ZONE 'Asia/Bangkok')::date,t.now,t.now+$1 * interval '1 minute',$1,'OPEN' FROM t RETURNING *`,[duration]);
  const round=mapRound(inserted.rows[0]);
  await client.query("INSERT INTO round_audit_logs(round_id,actor,action,details) VALUES($1,$2,'ROUND_OPENED',jsonb_build_object('duration_minutes',$3::int,'mode','manual'))",[round.id,adminId,duration]);
  await client.query("INSERT INTO round_audit_logs(round_id,actor,action,details) VALUES($1,'engine','ROUND_RULES_APPLIED',$2::jsonb)",[round.id,JSON.stringify(rules)]);
  await client.query("INSERT INTO round_audit_logs(round_id,actor,action,details) VALUES($1,'engine','ROUND_BUSINESS_SETTINGS_APPLIED',$2::jsonb)",[round.id,JSON.stringify(business)]);
  return {round:{...round,alertBeforeClose:rules.alertBeforeClose},serverTime:await dbNow(client)};
 });
}
/** Legacy LIVE round creation is disabled; use the manual admin round command. */
export async function startRoundForLive(_actorId:string,_idempotencyKey:string):Promise<never>{throw new RoundError('use_manual_round_start',410)}
export async function updateRoundSettings(duration:number,mode?:'manual'|'auto'){validateDuration(duration);if(mode!==undefined&&mode!=='manual')throw new RoundError('invalid_round_mode');return inTransaction(async client=>{
 await client.query('SELECT pg_advisory_xact_lock(74021601)');
 const previous=await client.query('SELECT duration_minutes FROM round_settings WHERE id=1 FOR UPDATE');
 const old=Number(previous.rows[0].duration_minutes);
 await client.query('UPDATE round_settings SET duration_minutes=$1,updated_at=clock_timestamp() WHERE id=1',[duration]);
 if(old!==duration)await client.query("INSERT INTO round_audit_logs(actor,action,details) VALUES('internal','DURATION_CHANGED',jsonb_build_object('from',$1::int,'to',$2::int))",[old,duration]);
 return {previous:old,next:duration,mode:'manual' as const};
 })}
export async function updateDurationForNextRound(duration:number){return updateRoundSettings(duration)}
export async function submitDemoEntry(memberId:string,roundId:string,input:EntryInput){validateEntry(input);if(!/^\d+$/.test(roundId))throw new RoundError('invalid_round_id');return inTransaction(async client=>{
 await client.query("SELECT set_config('pair_live.member_id',$1,true)",[memberId]);
 // Lock the round before checking database time; the worker takes the same lock when closing it.
 await assertConnectedOaInTransaction(client);
 const found=await client.query('SELECT * FROM rounds WHERE id=$1 AND epoch_id=current_round_epoch_id() FOR UPDATE',[roundId]);
 if(!found.rows[0])throw new RoundError('round_not_found',404);
 const round=found.rows[0];
 const prior=await client.query('SELECT * FROM round_entries WHERE member_id=$1 AND idempotency_key=$2',[memberId,input.idempotencyKey]);
 if(prior.rows[0]){const row=prior.rows[0];if(String(row.round_id)!==roundId||row.side!==input.side||Number(row.demo_points)!==input.demoPoints)throw new RoundError('idempotency_conflict',409);return {id:row.id,roundId:String(row.round_id),status:row.status,replayed:true}}
 const now=await dbNow(client);
 if(round.status!=='OPEN'||new Date(now)>=new Date(round.closes_at)||round.countdown_ends_at&&!round.countdown_stopped_at&&new Date(now)>=new Date(round.countdown_ends_at))throw new RoundError('round_closed',409);
 const rules=await appliedRules(client,roundId);
 if(input.demoPoints<rules.minEntryPoints||input.demoPoints>rules.maxEntryPoints)throw new RoundError('entry_points_out_of_range');
 const business=await appliedBusinessSettings(client,roundId);
 if(business.maxRoundPoints!==null&&BigInt(round.even_points)+BigInt(round.odd_points)+BigInt(input.demoPoints)>BigInt(business.maxRoundPoints))throw new RoundError('round_points_limit_exceeded',409);
 const walletEnabled=(await walletPathFromDatabase(client))==='wallet';
 let walletBalance:number|undefined;
 if(walletEnabled){const member=await client.query("SELECT id FROM members WHERE id=$1 AND status='active'",[memberId]);if(!member.rows[0])throw new RoundError('member_unavailable',403);
  try{const applied=await applyWalletMutationWithClient(client,{memberId,type:'DEMO_USE',points:input.demoPoints,referenceId:`ROUND_${roundId}_${input.idempotencyKey}`,idempotencyKey:input.idempotencyKey,actor:'round-engine',source:'round'});walletBalance=applied.wallet.availablePoints}catch(error){const code=error instanceof Error?error.message:'';if(code==='INSUFFICIENT_POINTS')throw new RoundError('insufficient_demo_points',409);if(code==='FROZEN')throw new RoundError('wallet_frozen',409);if(code==='NOT_ACTIVATED')throw new RoundError('wallet_not_activated',503);throw error}
 }else{const member=await client.query('UPDATE members SET demo_points=demo_points-$1,updated_at=clock_timestamp() WHERE id=$2 AND status=\'active\' AND demo_points>=$1 RETURNING id',[input.demoPoints,memberId]);if(!member.rows[0])throw new RoundError('member_unavailable_or_insufficient_points',409)}
 const inserted=await client.query('INSERT INTO round_entries(round_id,member_id,side,demo_points,idempotency_key) VALUES($1,$2,$3,$4,$5) RETURNING id,status',[roundId,memberId,input.side,input.demoPoints,input.idempotencyKey]);
 await client.query("UPDATE rounds SET even_people=even_people+CASE WHEN $2='even' THEN 1 ELSE 0 END,even_points=even_points+CASE WHEN $2='even' THEN $3::int ELSE 0 END,odd_people=odd_people+CASE WHEN $2='odd' THEN 1 ELSE 0 END,odd_points=odd_points+CASE WHEN $2='odd' THEN $3::int ELSE 0 END WHERE id=$1",[roundId,input.side,input.demoPoints]);
 await client.query("INSERT INTO round_audit_logs(round_id,actor,action,details) VALUES($1,'member','DEMO_ENTRY_ACCEPTED',jsonb_build_object('entry_id',$2::text))",[roundId,inserted.rows[0].id]);
 return {id:inserted.rows[0].id,roundId,status:'PENDING',replayed:false,walletBalance};
 })}
export async function roundTotals(roundId:string){const result=await database().query('SELECT even_people,even_points,odd_people,odd_points FROM rounds WHERE id=$1 AND epoch_id=current_round_epoch_id()',[roundId]);const row=result.rows[0];return {even:{people:Number(row?.even_people||0),points:Number(row?.even_points||0)},odd:{people:Number(row?.odd_people||0),points:Number(row?.odd_points||0)}}}
/** Admin action. The round lock serializes stop/cancel with entries and worker transitions. */
export async function decideRound(adminId:string,roundId:string,action:'stop'|'cancel'){
 if(!/^[0-9a-f-]{36}$/i.test(adminId)||!/^\d+$/.test(roundId))throw new RoundError('invalid_round_action',400);
 return inTransaction(async client=>{
  await client.query('SELECT pg_advisory_xact_lock(74021601)');
  const found=await client.query('SELECT * FROM rounds WHERE id=$1 AND epoch_id=current_round_epoch_id() FOR UPDATE',[roundId]);
  const round=found.rows[0];if(!round)throw new RoundError('round_not_found',404);
  if(action==='stop'){
   if(round.status==='SCANNING'||round.status==='REVIEW_REQUIRED')return {status:round.status,replayed:true};
   if(round.status!=='OPEN')throw new RoundError('round_not_open',409);
   await client.query("UPDATE rounds SET status='SCANNING',closed_at=clock_timestamp() WHERE id=$1",[roundId]);
   await client.query("INSERT INTO round_audit_logs(round_id,actor,action) VALUES($1,$2,'ROUND_STOPPED')",[roundId,adminId]);
   return {status:'SCANNING',replayed:false};
  }
  if(round.status==='CANCELLED')return {status:'CANCELLED',replayed:true};
  if(round.status==='SETTLED')throw new RoundError('round_already_settled',409);
  const walletEnabled=(await walletPathFromDatabase(client))==='wallet';
  // round_entries has FORCE RLS scoped to pair_live.member_id. Traverse members
  // under that existing policy; never grant the admin connection unscoped access.
  const members=await client.query('SELECT id FROM members ORDER BY id');
  let refundedEntries=0;
  for(const member of members.rows){
   await client.query("SELECT set_config('pair_live.member_id',$1,true)",[member.id]);
   const entries=await client.query("SELECT * FROM round_entries WHERE round_id=$1 AND member_id=$2 AND status='PENDING' ORDER BY id FOR UPDATE",[roundId,member.id]);
   for(const entry of entries.rows){
   if(walletEnabled){
    const use=await client.query("SELECT id,points FROM member_wallet_ledger WHERE member_id=$1 AND reference_id=$2 AND type='DEMO_USE'",[entry.member_id,`ROUND_${roundId}_${entry.idempotency_key}`]);
    if(!use.rows[0]||Number(use.rows[0].points)!==Number(entry.demo_points))throw new RoundError('original_wallet_use_missing',409);
    const refund=await applyWalletMutationWithClient(client,{memberId:entry.member_id,type:'DEMO_REFUND',points:Number(entry.demo_points),referenceId:`ROUND_REFUND_${entry.id}`,idempotencyKey:entry.id,actor:adminId,source:'round'});
    if(refund.replayed)throw new RoundError('refund_state_conflict',409);
   }else{
    const updated=await client.query('UPDATE members SET demo_points=demo_points+$1,updated_at=clock_timestamp() WHERE id=$2 RETURNING id',[entry.demo_points,entry.member_id]);
    if(!updated.rows[0])throw new RoundError('member_unavailable',409);
   }
   const changed=await client.query("UPDATE round_entries SET status='CANCELLED' WHERE id=$1 AND member_id=$2 AND status='PENDING' RETURNING id",[entry.id,member.id]);
   if(changed.rowCount!==1)throw new RoundError('refund_state_conflict',409);
   refundedEntries++;
   }
  }
  await client.query("SELECT set_config('pair_live.member_id','',true)");
  // A missing RLS-visible row must fail closed, so a cancellation cannot strand points.
  if(refundedEntries!==Number(round.even_people)+Number(round.odd_people))throw new RoundError('round_entries_mismatch',409);
  await client.query("UPDATE rounds SET status='CANCELLED',closed_at=coalesce(closed_at,clock_timestamp()) WHERE id=$1",[roundId]);
  await client.query("INSERT INTO round_audit_logs(round_id,actor,action,details) VALUES($1,$2,'ROUND_CANCELLED',jsonb_build_object('refunded_entries',$3::int))",[roundId,adminId,refundedEntries]);
  return {status:'CANCELLED',replayed:false,refundedEntries};
 });
}
export async function myRoundEntries(memberId:string){return inTransaction(async client=>{await client.query("SELECT set_config('pair_live.member_id',$1,true)",[memberId]);const result=await client.query('SELECT e.id,e.round_id,e.side,e.demo_points,e.status,e.created_at FROM round_entries e JOIN rounds r ON r.id=e.round_id WHERE e.member_id=$1 AND r.epoch_id=current_round_epoch_id() ORDER BY e.created_at DESC LIMIT 100',[memberId]);return result.rows})}
/** Internal-only refund path. Call after an authorized cancellation; no browser route exposes it. */
export async function refundCancelledDemoEntry(memberId:string,entryId:string){return inTransaction(async client=>{
 await client.query("SELECT set_config('pair_live.member_id',$1,true)",[memberId]);
 if(process.env.PAIR_WALLET_CUTOVER_VERIFIED!=='true')throw new RoundError('wallet_cutover_not_verified',503);
 const identity=await client.query('SELECT e.round_id FROM round_entries e JOIN rounds r ON r.id=e.round_id WHERE e.id=$1 AND e.member_id=$2 AND r.epoch_id=current_round_epoch_id()',[entryId,memberId]);if(!identity.rows[0])throw new RoundError('entry_not_found',404);
 const round=await client.query('SELECT id,status FROM rounds WHERE id=$1 FOR UPDATE',[identity.rows[0].round_id]);
 const found=await client.query('SELECT * FROM round_entries WHERE id=$1 AND member_id=$2 FOR UPDATE',[entryId,memberId]);const entry=found.rows[0];if(!entry)throw new RoundError('entry_not_found',404);
 if(round.rows[0]?.status!=='CANCELLED'&&entry.status!=='CANCELLED')throw new RoundError('entry_not_cancelled',409);
 const reference=`ROUND_${entry.round_id}_${entry.idempotency_key}`;
 const use=await client.query("SELECT id,points FROM member_wallet_ledger WHERE member_id=$1 AND reference_id=$2 AND type='DEMO_USE'",[memberId,reference]);
 if(!use.rows[0]||Number(use.rows[0].points)!==Number(entry.demo_points))throw new RoundError('original_wallet_use_missing',409);
 const applied=await applyWalletMutationWithClient(client,{memberId,type:'DEMO_REFUND',points:Number(entry.demo_points),referenceId:`ROUND_REFUND_${entry.id}`,idempotencyKey:entry.id,actor:'round-engine',source:'round'});
 if(!applied.replayed){await client.query("UPDATE round_entries SET status='CANCELLED' WHERE id=$1 AND member_id=$2",[entryId,memberId]);await client.query("INSERT INTO round_audit_logs(round_id,actor,action,details) VALUES($1,'engine','DEMO_ENTRY_REFUNDED',jsonb_build_object('entry_id',$2::text,'wallet_ledger_id',$3::text))",[entry.round_id,entry.id,applied.entry.id])}
 return {entryId,replayed:applied.replayed,walletBalance:applied.wallet.availablePoints};
})}
