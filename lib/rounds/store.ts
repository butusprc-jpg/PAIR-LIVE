import type {PoolClient} from 'pg';
import {database} from '../server/db';
import {RoundError,validateDuration,validateEntry} from './core';
import type {EntryInput,Round} from './core';
function asIso(value:unknown){return value instanceof Date?value.toISOString():new Date(String(value)).toISOString()}
function mapRound(row:Record<string,unknown>):Round{return {id:String(row.id),opensAt:asIso(row.opens_at),closesAt:asIso(row.closes_at),durationMinutes:Number(row.duration_minutes),status:row.status as Round['status'],closedAt:row.closed_at?asIso(row.closed_at):null,settledAt:row.settled_at?asIso(row.settled_at):null,resultNumber:row.result_number?String(row.result_number):null}}
async function inTransaction<T>(fn:(client:PoolClient)=>Promise<T>){const client=await database().connect();try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
async function dbNow(client:PoolClient){const result=await client.query('SELECT clock_timestamp() AS now');return new Date(result.rows[0].now).toISOString()}
async function transition(client:PoolClient){
 const now=await dbNow(client);
 const found=await client.query("SELECT * FROM rounds WHERE status IN ('OPEN','CLOSED','SCANNING','REVIEW_REQUIRED') ORDER BY id DESC LIMIT 1 FOR UPDATE");
 if(!found.rows[0])return {round:null as Round|null,serverTime:now};
 let row=found.rows[0];
 if(row.status==='OPEN'&&new Date(now)>=new Date(row.closes_at)){
  const changed=await client.query("UPDATE rounds SET status='CLOSED',closed_at=clock_timestamp() WHERE id=$1 AND status='OPEN' RETURNING *",[row.id]);row=changed.rows[0];
  await client.query("INSERT INTO round_audit_logs(round_id,actor,action) VALUES($1,'engine','ROUND_CLOSED')",[row.id]);
 }else if(row.status==='CLOSED'){
  const changed=await client.query("UPDATE rounds SET status='SCANNING' WHERE id=$1 AND status='CLOSED' RETURNING *",[row.id]);row=changed.rows[0];
  await client.query("INSERT INTO round_audit_logs(round_id,actor,action) VALUES($1,'engine','AWAITING_SCAN')",[row.id]);
 }
 return {round:mapRound(row),serverTime:now};
}
export async function currentRound(){return inTransaction(async client=>transition(client))}
export async function tickRoundEngine(){return inTransaction(async client=>{
  await client.query('SELECT pg_advisory_xact_lock(74021601)');
  const current=await transition(client);
  if(current.round)return current;
  const setting=await client.query('SELECT duration_minutes FROM round_settings WHERE id=1');
  const duration=validateDuration(Number(setting.rows[0]?.duration_minutes??5));
  const inserted=await client.query(`WITH t AS (SELECT clock_timestamp() AS now) INSERT INTO rounds(round_date,opens_at,closes_at,duration_minutes,status)
  SELECT (t.now AT TIME ZONE 'Asia/Bangkok')::date,t.now,t.now+$1 * interval '1 minute',$1,'OPEN' FROM t RETURNING *`,[duration]);
  const round=mapRound(inserted.rows[0]);
  await client.query("INSERT INTO round_audit_logs(round_id,actor,action,details) VALUES($1,'engine','ROUND_OPENED',jsonb_build_object('duration_minutes',$2::int))",[round.id,duration]);
  return {round,serverTime:await dbNow(client)};
 })}
export async function updateDurationForNextRound(duration:number){validateDuration(duration);return inTransaction(async client=>{
 const previous=await client.query('SELECT duration_minutes FROM round_settings WHERE id=1 FOR UPDATE');
 const old=Number(previous.rows[0].duration_minutes);
 await client.query('UPDATE round_settings SET duration_minutes=$1,updated_at=clock_timestamp() WHERE id=1',[duration]);
 await client.query("INSERT INTO round_audit_logs(actor,action,details) VALUES('internal','DURATION_CHANGED',jsonb_build_object('from',$1::int,'to',$2::int))",[old,duration]);
 return {previous:old,next:duration};
 })}
export async function submitDemoEntry(memberId:string,roundId:string,input:EntryInput){validateEntry(input);if(!/^\d+$/.test(roundId))throw new RoundError('invalid_round_id');return inTransaction(async client=>{
 await client.query("SELECT set_config('pair_live.member_id',$1,true)",[memberId]);
 // Lock the round before checking database time; the worker takes the same lock when closing it.
 const found=await client.query('SELECT * FROM rounds WHERE id=$1 FOR UPDATE',[roundId]);
 if(!found.rows[0])throw new RoundError('round_not_found',404);
 const round=found.rows[0];
 const prior=await client.query('SELECT * FROM round_entries WHERE member_id=$1 AND idempotency_key=$2',[memberId,input.idempotencyKey]);
 if(prior.rows[0]){const row=prior.rows[0];if(String(row.round_id)!==roundId||row.side!==input.side||Number(row.demo_points)!==input.demoPoints)throw new RoundError('idempotency_conflict',409);return {id:row.id,roundId:String(row.round_id),status:row.status,replayed:true}}
 const now=await dbNow(client);
 if(round.status!=='OPEN'||new Date(now)>=new Date(round.closes_at))throw new RoundError('round_closed',409);
 const member=await client.query('UPDATE members SET demo_points=demo_points-$1,updated_at=clock_timestamp() WHERE id=$2 AND status=\'active\' AND demo_points>=$1 RETURNING id',[input.demoPoints,memberId]);
 if(!member.rows[0])throw new RoundError('member_unavailable_or_insufficient_points',409);
 const inserted=await client.query('INSERT INTO round_entries(round_id,member_id,side,demo_points,idempotency_key) VALUES($1,$2,$3,$4,$5) RETURNING id,status',[roundId,memberId,input.side,input.demoPoints,input.idempotencyKey]);
 await client.query("UPDATE rounds SET even_people=even_people+CASE WHEN $2='even' THEN 1 ELSE 0 END,even_points=even_points+CASE WHEN $2='even' THEN $3::int ELSE 0 END,odd_people=odd_people+CASE WHEN $2='odd' THEN 1 ELSE 0 END,odd_points=odd_points+CASE WHEN $2='odd' THEN $3::int ELSE 0 END WHERE id=$1",[roundId,input.side,input.demoPoints]);
 await client.query("INSERT INTO round_audit_logs(round_id,actor,action,details) VALUES($1,'member','DEMO_ENTRY_ACCEPTED',jsonb_build_object('entry_id',$2::text))",[roundId,inserted.rows[0].id]);
 return {id:inserted.rows[0].id,roundId,status:'PENDING',replayed:false};
 })}
export async function roundTotals(roundId:string){const result=await database().query('SELECT even_people,even_points,odd_people,odd_points FROM rounds WHERE id=$1',[roundId]);const row=result.rows[0];return {even:{people:Number(row?.even_people||0),points:Number(row?.even_points||0)},odd:{people:Number(row?.odd_people||0),points:Number(row?.odd_points||0)}}}
export async function myRoundEntries(memberId:string){return inTransaction(async client=>{await client.query("SELECT set_config('pair_live.member_id',$1,true)",[memberId]);const result=await client.query('SELECT id,round_id,side,demo_points,status,created_at FROM round_entries WHERE member_id=$1 ORDER BY created_at DESC LIMIT 100',[memberId]);return result.rows})}
