import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {database} from '../server/db';
import {pushLine,providerPairConfigured} from '../topup/line-provider';
import {quotaAllows} from './round-broadcast';
import {liveStartCard} from './start-cards';

type Job={event_id:string;member_id:string;recipient_user_id:string;retry_key:string;attempts:number;shop_name:string|null};
export async function dispatchLiveStartLine(pool:Pool=database(),fetcher:typeof fetch=fetch){
 const claimant=await pool.connect();let job:Job|undefined;
 try{await claimant.query('BEGIN');const result=await claimant.query<Job>(`SELECT o.event_id,o.member_id,o.recipient_user_id,o.retry_key,o.attempts,e.shop_name FROM live_start_line_outbox o JOIN live_start_line_events e ON e.id=o.event_id
 WHERE o.status IN ('PENDING','FAILED','SENDING') AND o.attempts<5 AND o.next_attempt_at<=clock_timestamp() AND (o.lease_until IS NULL OR o.lease_until<clock_timestamp())
 ORDER BY o.next_attempt_at,o.event_id,o.member_id LIMIT 1 FOR UPDATE OF o SKIP LOCKED`);
 job=result.rows[0];if(!job){await claimant.query('COMMIT');return null}
 await claimant.query("UPDATE live_start_line_outbox SET status='SENDING',attempts=attempts+1,lease_until=clock_timestamp()+interval '45 seconds' WHERE event_id=$1 AND member_id=$2",[job.event_id,job.member_id]);await claimant.query('COMMIT')
 }catch(error){await claimant.query('ROLLBACK');throw error}finally{claimant.release()}
 const delivery=await pool.connect();try{await delivery.query('BEGIN');await delivery.query('SELECT pg_advisory_xact_lock(748201,22)');
 await delivery.query("SELECT set_config('pair_live.countdown_dispatch','true',true)");
 const state=(await delivery.query<{line_oa_id:string;enabled:boolean;paused:boolean;deleted_at:Date|null;expires_at:Date;verified_token_hash:string|null;display_enabled:boolean;opted_in:boolean;current_revision:string;event_revision:string}>(`SELECT a.line_oa_id,a.enabled,a.paused,a.deleted_at,a.expires_at,a.verified_token_hash,t.display_enabled,p.enabled AS opted_in,t.revision AS current_revision,e.live_revision AS event_revision
 FROM live_start_line_outbox o JOIN oa_service_control a ON a.id=o.oa_id JOIN vdo_ninja_tenants t ON t.oa_id=o.oa_id
 JOIN live_start_line_events e ON e.id=o.event_id JOIN member_countdown_line_preferences p ON p.member_id=o.member_id WHERE o.event_id=$1 AND o.member_id=$2 FOR SHARE OF a,t`,[job.event_id,job.member_id])).rows[0];
 const token=process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN,hash=token?createHash('sha256').update(token).digest('hex'):null;
 const current=!!state&&state.display_enabled&&String(state.current_revision)===String(state.event_revision);
 const ready=current&&state.opted_in&&!!token&&providerPairConfigured()&&state.line_oa_id===process.env.CONNECTED_LINE_OA_ID&&state.enabled&&!state.paused&&!state.deleted_at&&new Date(state.expires_at)>new Date()&&state.verified_token_hash===hash;
 let sent=false,code:string|null=null,delay=30;
 if(!ready){code=current?'live_or_line_unavailable':'live_not_current';delay=current?300:0}
 else try{if(!await quotaAllows(token,fetcher)){code='line_quota_exhausted';delay=3600}else{await pushLine(job.recipient_user_id,[liveStartCard(job.shop_name)],job.retry_key,fetcher,token);sent=true}}catch{code='line_temporary';delay=Math.min(3600,30*2**job.attempts)}
 await delivery.query(`UPDATE live_start_line_outbox SET status=$3,lease_until=NULL,last_error=$4,sent_at=CASE WHEN $3='SENT' THEN clock_timestamp() ELSE sent_at END,next_attempt_at=clock_timestamp()+$5*interval '1 second',attempts=CASE WHEN $4='live_not_current' THEN 5 ELSE attempts END WHERE event_id=$1 AND member_id=$2 AND status='SENDING' AND attempts=$6`,[job.event_id,job.member_id,sent?'SENT':'FAILED',code,delay,job.attempts+1]);
 await delivery.query('COMMIT');return {eventId:job.event_id,status:sent?'SENT':'FAILED',errorCode:code};
 }catch(error){await delivery.query('ROLLBACK');throw error}finally{delivery.release()}
}
