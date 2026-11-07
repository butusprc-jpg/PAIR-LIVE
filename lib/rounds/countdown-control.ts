import type {Pool,PoolClient} from 'pg';
import {createHash} from 'node:crypto';
import {RoundError} from './core';
import {providerPairConfigured} from '../topup/line-provider';
const secondsValid=(value:unknown)=>typeof value==='number'&&Number.isInteger(value)&&value>=30&&value<=3600;
export function countdownSeconds(minutes:unknown){const seconds=typeof minutes==='number'?minutes*60:NaN;if(!secondsValid(seconds))throw new RoundError('invalid_countdown_duration');return seconds}
export function countdownLabel(seconds:number){return seconds%60===0?`${seconds/60} นาที`:`${seconds} วินาที`}
export type CountdownState={roundId:string;startedAt:string|null;endsAt:string|null;stoppedAt:string|null;durationSeconds:number|null;status:'NOT_STARTED'|'RUNNING'|'STOPPED'|'EXPIRED';remainingSeconds:number;recipients:number;sent:number;failed:number;lineReady:boolean;serverTime:string};
function iso(value:unknown){return value?new Date(String(value)).toISOString():null}
function state(row:Record<string,unknown>,serverTime:Date,counts:{recipients:number;sent:number;failed:number},lineReady:boolean):CountdownState{
 const startedAt=iso(row.countdown_started_at),endsAt=iso(row.countdown_ends_at),stoppedAt=iso(row.countdown_stopped_at);
 const remainingSeconds=endsAt&&!stoppedAt?Math.max(0,Math.ceil((Date.parse(endsAt)-serverTime.getTime())/1000)):0;
 const status=!startedAt?'NOT_STARTED':stoppedAt?'STOPPED':remainingSeconds>0?'RUNNING':'EXPIRED';
 return {roundId:String(row.id),startedAt,endsAt,stoppedAt,durationSeconds:startedAt&&endsAt?Math.round((Date.parse(endsAt)-Date.parse(startedAt))/1000):null,status,remainingSeconds,...counts,lineReady,serverTime:serverTime.toISOString()};
}
async function counts(client:PoolClient,roundId:string){const result=await client.query<{recipients:number;sent:number;failed:number}>(`SELECT count(*)::int AS recipients,count(*) FILTER (WHERE status='SENT')::int AS sent,count(*) FILTER (WHERE status='FAILED')::int AS failed FROM round_countdown_line_outbox WHERE round_id=$1`,[roundId]);return result.rows[0]??{recipients:0,sent:0,failed:0}}
async function lineBinding(client:PoolClient){const id=process.env.CONNECTED_LINE_OA_ID,token=process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;if(!id||!token||!providerPairConfigured())throw new RoundError('countdown_line_not_ready',503);
 const hash=createHash('sha256').update(token).digest('hex');const result=await client.query<{id:string}>(`SELECT id FROM oa_service_control WHERE line_oa_id=$1 AND deleted_at IS NULL AND enabled=true AND paused=false AND expires_at>clock_timestamp() AND verified_token_hash=$2 FOR SHARE`,[id,hash]);if(result.rowCount!==1)throw new RoundError('oa_service_inactive',403);return result.rows[0].id}
export async function readCountdown(pool:Pool,roundId?:string){const client=await pool.connect();try{const found=await client.query(`SELECT * FROM rounds WHERE epoch_id=current_round_epoch_id() AND id=COALESCE($1::bigint,(SELECT id FROM rounds WHERE epoch_id=current_round_epoch_id() AND status IN ('OPEN','CLOSED','SCANNING','REVIEW_REQUIRED') ORDER BY id DESC LIMIT 1))`,[roundId??null]);const now=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;const row=found.rows[0];if(!row)return {countdown:null,serverTime:now.toISOString()};let ready=false;try{await lineBinding(client);ready=true}catch{/* Read-only status remains visible when LINE is unavailable. */}return {countdown:state(row,now,await counts(client,String(row.id)),ready),serverTime:now.toISOString()}}finally{client.release()}}
export async function saveCountdownDuration(pool:Pool,minutes:unknown){const seconds=countdownSeconds(minutes);const result=await pool.query('UPDATE round_settings SET countdown_seconds=$1,updated_at=clock_timestamp() WHERE id=1 RETURNING countdown_seconds',[seconds]);return {minutes:result.rows[0].countdown_seconds/60,seconds}}
export async function readCountdownDuration(pool:Pool){const result=await pool.query('SELECT countdown_seconds FROM round_settings WHERE id=1');const seconds=Number(result.rows[0]?.countdown_seconds??120);return {minutes:seconds/60,seconds}}
export async function changeCountdown(pool:Pool,action:'start'|'stop',actorId:string){const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock_shared(74021602)');await client.query('SELECT pg_advisory_xact_lock(74021601)');const round=(await client.query(`SELECT * FROM rounds WHERE epoch_id=current_round_epoch_id() AND status IN ('OPEN','CLOSED','SCANNING','REVIEW_REQUIRED') ORDER BY id DESC LIMIT 1 FOR UPDATE`)).rows[0];if(!round)throw new RoundError('round_not_active',409);const now=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
 if(action==='start'){
  if(round.countdown_started_at){await client.query('COMMIT');return {countdown:state(round,now,await counts(client,String(round.id)),true),replayed:true}}
  if(round.status!=='OPEN'||new Date(round.closes_at)<=now)throw new RoundError('round_not_open',409);
  const oaId=await lineBinding(client);const seconds=Number((await client.query('SELECT countdown_seconds FROM round_settings WHERE id=1')).rows[0].countdown_seconds);if(!secondsValid(seconds))throw new RoundError('invalid_countdown_duration');
  // Membership is explicit opt-in and verified LINE identity on the configured provider pair.
  await client.query("SELECT set_config('pair_live.countdown_dispatch','true',true)");
  if(new Date(round.closes_at).getTime()-now.getTime()<seconds*1000)throw new RoundError('countdown_exceeds_round_remaining',409);
  const changed=(await client.query(`UPDATE rounds SET countdown_started_at=clock_timestamp(),countdown_ends_at=clock_timestamp()+$2 * interval '1 second' WHERE id=$1 RETURNING *`,[round.id,seconds])).rows[0];
  await client.query(`INSERT INTO round_countdown_line_outbox(round_id,member_id,oa_id,recipient_user_id)
    SELECT $1,p.member_id,$2,i.provider_user_id FROM member_countdown_line_preferences p
    JOIN members m ON m.id=p.member_id AND m.status='active'
    JOIN LATERAL (SELECT provider_user_id FROM member_identities WHERE member_id=p.member_id AND provider='line' AND provider_channel_id=$3 ORDER BY last_login_at DESC LIMIT 1) i ON true
    WHERE p.enabled=true AND i.provider_user_id ~ '^U[0-9a-fA-F]{32}$' ON CONFLICT DO NOTHING`,[round.id,oaId,process.env.LINE_LOGIN_CHANNEL_ID]);
  const selected=await counts(client,String(round.id));await client.query("INSERT INTO round_audit_logs(round_id,actor,action,details) VALUES($1,$2,'COUNTDOWN_STARTED',jsonb_build_object('duration_seconds',$3::int,'recipients',$4::int))",[round.id,actorId,seconds,selected.recipients]);await client.query('COMMIT');return {countdown:state(changed,now,selected,true),replayed:false};
 }
 if(!round.countdown_started_at)throw new RoundError('countdown_not_started',409);
 if(round.countdown_stopped_at){await client.query('COMMIT');return {countdown:state(round,now,await counts(client,String(round.id)),true),replayed:true}}
 if(new Date(round.countdown_ends_at)<=now)throw new RoundError('countdown_not_running',409);
 const changed=(await client.query('UPDATE rounds SET countdown_stopped_at=clock_timestamp() WHERE id=$1 RETURNING *',[round.id])).rows[0];await client.query("INSERT INTO round_audit_logs(round_id,actor,action) VALUES($1,$2,'COUNTDOWN_STOPPED')",[round.id,actorId]);await client.query('COMMIT');return {countdown:state(changed,now,await counts(client,String(round.id)),true),replayed:false};
 }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
export async function readMemberCountdownPreference(pool:Pool,memberId:string){const client=await pool.connect();try{await client.query('BEGIN');await client.query("SELECT set_config('pair_live.member_id',$1,true)",[memberId]);const result=await client.query('SELECT enabled FROM member_countdown_line_preferences WHERE member_id=$1',[memberId]);await client.query('COMMIT');return {enabled:result.rows[0]?.enabled===true}}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
export async function setMemberCountdownPreference(pool:Pool,memberId:string,enabled:boolean){const client=await pool.connect();try{await client.query('BEGIN');await client.query("SELECT set_config('pair_live.member_id',$1,true)",[memberId]);await client.query(`INSERT INTO member_countdown_line_preferences(member_id,enabled) VALUES($1,$2) ON CONFLICT(member_id) DO UPDATE SET enabled=$2,updated_at=now()`,[memberId,enabled]);await client.query('COMMIT');return {enabled}}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
