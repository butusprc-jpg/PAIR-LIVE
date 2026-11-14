import type {Pool} from 'pg';
import {createHash} from 'node:crypto';
import {database} from '../server/db';
import {pushLine,providerPairConfigured} from '../topup/line-provider';
import {quotaAllows} from './round-broadcast';
import {countdownLabel} from '../rounds/countdown-control';
import {TopupError} from '../topup/store';
import {countdownStartCard} from './start-cards';
type Job={round_id:string;member_id:string;recipient_user_id:string;retry_key:string;attempts:number;duration_seconds:number};
type State={round_status:string;line_oa_id:string;enabled:boolean;paused:boolean;expires_at:Date;verified_token_hash:string|null;deleted_at:Date|null;countdown_ends_at:Date;countdown_stopped_at:Date|null};
export function countdownMessage(roundId:string,durationSeconds:number){return `PAIR LIVE ⏳ เริ่มนับถอยหลังแล้ว\nรอบที่: ${roundId}\nเวลานับถอยหลัง: ${countdownLabel(durationSeconds)}\nกรุณาดำเนินการก่อนหมดเวลา`}
export async function dispatchCountdownLine(pool:Pool=database(),fetcher:typeof fetch=fetch){
 const claimant=await pool.connect();let job:Job|undefined;
 try{await claimant.query('BEGIN');const result=await claimant.query<Job>(`SELECT o.round_id,o.member_id,o.recipient_user_id,o.retry_key,o.attempts,
 extract(epoch FROM (r.countdown_ends_at-r.countdown_started_at))::int AS duration_seconds
 FROM round_countdown_line_outbox o JOIN rounds r ON r.id=o.round_id
 WHERE r.epoch_id=current_round_epoch_id() AND o.status IN ('PENDING','FAILED','SENDING') AND o.attempts<5 AND o.next_attempt_at<=clock_timestamp()
 AND (o.lease_until IS NULL OR o.lease_until<clock_timestamp())
 ORDER BY o.next_attempt_at,o.round_id,o.member_id LIMIT 1 FOR UPDATE OF o SKIP LOCKED`);
 job=result.rows[0];if(!job){await claimant.query('COMMIT');return null}
 await claimant.query(`UPDATE round_countdown_line_outbox SET status='SENDING',attempts=attempts+1,lease_until=clock_timestamp()+interval '45 seconds',updated_at=clock_timestamp() WHERE round_id=$1 AND member_id=$2`,[job.round_id,job.member_id]);await claimant.query('COMMIT')
 }catch(error){await claimant.query('ROLLBACK');throw error}finally{claimant.release()}
 const delivery=await pool.connect();try{await delivery.query('BEGIN');
 // Serialize with owner pause/disable and hold the round until dispatch completes.
 await delivery.query('SELECT pg_advisory_xact_lock(748201,22)');
 const state=(await delivery.query<State>(`SELECT r.status AS round_status,a.line_oa_id,a.enabled,a.paused,a.expires_at,a.verified_token_hash,a.deleted_at,r.countdown_ends_at,r.countdown_stopped_at
 FROM round_countdown_line_outbox o JOIN rounds r ON r.id=o.round_id JOIN oa_service_control a ON a.id=o.oa_id
 WHERE o.round_id=$1 AND o.member_id=$2 AND r.epoch_id=current_round_epoch_id() FOR SHARE OF a,r`,[job.round_id,job.member_id])).rows[0];
 const token=process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN,hash=token?createHash('sha256').update(token).digest('hex'):null;
 const running=!!state&&state.round_status==='OPEN'&&!state.countdown_stopped_at&&new Date(state.countdown_ends_at)>new Date();
 const ready=running&&!!token&&providerPairConfigured()&&state.line_oa_id===process.env.CONNECTED_LINE_OA_ID&&state.enabled&&!state.paused&&!state.deleted_at&&new Date(state.expires_at)>new Date()&&state.verified_token_hash===hash;
 let sent=false,code:string|null=null,httpStatus:number|null=null,delay=30;
 if(!ready){code=running?'oa_or_line_unavailable':'countdown_not_running';delay=running?300:0}
 else try{if(!await quotaAllows(token,fetcher)){code='line_quota_exhausted';delay=3600}else{httpStatus=await pushLine(job.recipient_user_id,[countdownStartCard(String(job.round_id),Number(job.duration_seconds))],job.retry_key,fetcher,token);sent=true}}catch(error){httpStatus=error instanceof TopupError?error.status:null;code=httpStatus===503?'line_temporary':'line_rejected';delay=httpStatus===503?Math.min(3600,30*2**job.attempts):3600}
 const next=sent?'SENT':'FAILED';await delivery.query(`UPDATE round_countdown_line_outbox SET status=$3,lease_until=NULL,last_error=$4,last_http_status=$5,
 sent_at=CASE WHEN $3='SENT' THEN clock_timestamp() ELSE sent_at END,attempts=CASE WHEN $4='countdown_not_running' THEN 5 ELSE attempts END,
 next_attempt_at=clock_timestamp()+$6 * interval '1 second',updated_at=clock_timestamp()
 WHERE round_id=$1 AND member_id=$2 AND status='SENDING' AND attempts=$7`,[job.round_id,job.member_id,next,code,httpStatus,delay,job.attempts+1]);
 await delivery.query('COMMIT');return {roundId:String(job.round_id),status:next,errorCode:code};
 }catch(error){await delivery.query('ROLLBACK');throw error}finally{delivery.release()}
}
