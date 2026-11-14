import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {database} from '../server/db';
import {pushLine,providerPairConfigured} from '../topup/line-provider';
import {quotaAllows} from './round-broadcast';
import {resultNoticeCard} from './game-notices';

type Job={entry_id:string;member_id:string;recipient_user_id:string;retry_key:string;attempts:number};
type State={round_id:string;round_status:string;result_number:string|null;side:'even'|'odd';demo_points:number;entry_status:string;oa_match:boolean;member_status:string;line_oa_id:string;enabled:boolean;paused:boolean;deleted_at:Date|null;expires_at:Date;verified_token_hash:string|null;identity_valid:boolean;award_points:string|null;ledger_points:string|null;ledger_type:string|null;legacy_ledger_points:string|null};
export async function dispatchRoundResultLine(pool:Pool=database(),fetcher:typeof fetch=fetch){
 const claimant=await pool.connect();let job:Job|undefined;
 try{await claimant.query('BEGIN');const selected=await claimant.query<Job>(`SELECT entry_id,member_id,recipient_user_id,retry_key,attempts FROM round_result_line_outbox
 WHERE status IN ('PENDING','FAILED','SENDING') AND attempts<5 AND next_attempt_at<=clock_timestamp() AND (lease_until IS NULL OR lease_until<clock_timestamp())
 ORDER BY next_attempt_at,entry_id LIMIT 1 FOR UPDATE SKIP LOCKED`);job=selected.rows[0];
  if(!job){await claimant.query('COMMIT');return null}
  await claimant.query("UPDATE round_result_line_outbox SET status='SENDING',attempts=attempts+1,lease_until=clock_timestamp()+interval '45 seconds' WHERE entry_id=$1",[job.entry_id]);await claimant.query('COMMIT');
 }catch(error){await claimant.query('ROLLBACK');throw error}finally{claimant.release()}
 const delivery=await pool.connect();try{await delivery.query('BEGIN');await delivery.query('SELECT pg_advisory_xact_lock(748201,22)');await delivery.query("SELECT set_config('pair_live.member_id',$1,true)",[job.member_id]);
  const state=(await delivery.query<State>(`SELECT r.id AS round_id,r.status AS round_status,r.result_number,e.side,e.demo_points,e.status AS entry_status,
    r.settlement_oa_id=o.oa_id AS oa_match,m.status AS member_status,a.line_oa_id,a.enabled,a.paused,a.deleted_at,a.expires_at,a.verified_token_hash,
    EXISTS(SELECT 1 FROM member_identities i WHERE i.member_id=o.member_id AND i.provider='line' AND i.provider_channel_id=$2 AND i.provider_user_id=o.recipient_user_id) AS identity_valid,
    w.credited_points AS award_points,l.points AS ledger_points,l.type AS ledger_type,ll.points AS legacy_ledger_points
   FROM round_result_line_outbox o JOIN members m ON m.id=o.member_id JOIN round_entries e ON e.id=o.entry_id AND e.member_id=o.member_id AND e.round_id=o.round_id
   JOIN rounds r ON r.id=o.round_id JOIN oa_service_control a ON a.id=o.oa_id
   LEFT JOIN round_settlement_awards w ON w.entry_id=e.id AND w.member_id=e.member_id
   LEFT JOIN member_wallet_ledger l ON l.id=w.wallet_ledger_id AND l.member_id=e.member_id
   LEFT JOIN round_legacy_award_ledger ll ON ll.id=w.legacy_ledger_id AND ll.member_id=e.member_id
   WHERE o.entry_id=$1 FOR SHARE OF r,a,e`,[job.entry_id,process.env.LINE_LOGIN_CHANNEL_ID])).rows[0];
  const token=process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN,hash=token?createHash('sha256').update(token).digest('hex'):null;
  const bound=!!state&&state.round_status==='SETTLED'&&state.oa_match&&state.member_status==='active'&&state.identity_valid&&!!token&&providerPairConfigured()&&state.line_oa_id===process.env.CONNECTED_LINE_OA_ID&&state.enabled&&!state.paused&&!state.deleted_at&&new Date(state.expires_at)>new Date()&&state.verified_token_hash===hash;
  const winner=state?.entry_status==='CORRECT';
  const valid=!!state&&!!state.result_number&&['CORRECT','INCORRECT'].includes(state.entry_status)&&
   (winner?state.award_points!==null&&((state.ledger_points===state.award_points&&state.ledger_type==='DEMO_GRANT')||state.legacy_ledger_points===state.award_points):state.award_points===null);
  let sent=false,code:string|null=null,delay=30,terminal=false;
  if(!bound){code=state?.identity_valid===false?'line_identity_missing':'oa_or_settlement_unavailable';delay=300;terminal=state?.identity_valid===false}
  else if(!valid){code='settlement_record_mismatch';terminal=true;delay=0}
  else try{if(!await quotaAllows(token,fetcher)){code='line_quota_exhausted';delay=3600}else{
   const card=resultNoticeCard({roundId:String(state.round_id),resultNumber:state.result_number!,chosenSide:state.side,stakePoints:Number(state.demo_points),outcome:state.entry_status as 'CORRECT'|'INCORRECT',creditedPoints:winner?Number(state.award_points):0});
   await pushLine(job.recipient_user_id,[card],job.retry_key,fetcher,token);sent=true;
  }}catch{code='line_temporary';delay=Math.min(3600,30*2**job.attempts)}
  const status=sent?'SENT':terminal?'UNDELIVERABLE':'FAILED';
  await delivery.query(`UPDATE round_result_line_outbox SET status=$2,lease_until=NULL,last_error=$3,sent_at=CASE WHEN $2='SENT' THEN clock_timestamp() ELSE sent_at END,
   attempts=CASE WHEN $2='UNDELIVERABLE' THEN 5 ELSE attempts END,next_attempt_at=clock_timestamp()+$4*interval '1 second'
   WHERE entry_id=$1 AND status='SENDING' AND attempts=$5`,[job.entry_id,status,code,delay,job.attempts+1]);
  await delivery.query('COMMIT');return {entryId:job.entry_id,status,errorCode:code};
 }catch(error){await delivery.query('ROLLBACK');throw error}finally{delivery.release()}
}
