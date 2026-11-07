import type {Pool,PoolClient} from 'pg';
import {database} from '../server/db';

export const closingBroadcastText='🔴 PAIR LIVE เหลือเวลาอีก 1 นาที! ระบบกำลังจะปิดรับการทายผล รีบเข้ามาทายผลก่อนหมดเวลา';
export type BroadcastOutcome={status:'SENT'|'FAILED'|'UNKNOWN';httpStatus?:number;acceptedRequestId?:string;errorCode?:string;retryAfterMs?:number};
export type BroadcastJob={roundId:string;retryKey:string;attempts:number;closesAt:string};
type ClaimedJob=BroadcastJob&{roundStatus:string};

/** The worker queues this on server time; a one-minute round queues immediately after opening. */
export async function enqueueClosingBroadcast(client:PoolClient,round:{id:string;status:string;closesAt:string},serverTime:string){
 const remaining=Date.parse(round.closesAt)-Date.parse(serverTime);
 if(round.status!=='OPEN'||!Number.isFinite(remaining)||remaining<=0||remaining>60_000)return false;
 const inserted=await client.query('INSERT INTO round_line_broadcast_outbox(round_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING round_id',[round.id]);
 if(inserted.rowCount)await client.query("INSERT INTO round_audit_logs(round_id,actor,action) VALUES($1,'engine','LINE_BROADCAST_QUEUED')",[round.id]);
 return !!inserted.rowCount;
}

async function quotaAllows(token:string,fetcher:typeof fetch):Promise<boolean>{
 const headers={Authorization:`Bearer ${token}`};
 const [quota,usage]=await Promise.all([
  fetcher('https://api.line.me/v2/bot/message/quota',{headers,signal:AbortSignal.timeout(5000)}),
  fetcher('https://api.line.me/v2/bot/message/quota/consumption',{headers,signal:AbortSignal.timeout(5000)})
 ]);
 if(quota.status===429||usage.status===429)throw new Error('quota_rate_limited');
 if(!quota.ok||!usage.ok)throw new Error('quota_check_failed');
 const limit=await quota.json() as {type?:string;value?:number},used=await usage.json() as {totalUsage?:number};
 if(limit.type==='limited'&&Number.isFinite(limit.value)&&Number.isFinite(used.totalUsage))return Number(used.totalUsage)<Number(limit.value);
 if(limit.type==='unlimited')return true;
 throw new Error('quota_check_invalid');
}

export async function sendClosingBroadcast(job:BroadcastJob,token:string|undefined,fetcher:typeof fetch=fetch):Promise<BroadcastOutcome>{
 if(!token)return {status:'FAILED',errorCode:'line_not_configured',retryAfterMs:86_400_000};
 try{
  if(!await quotaAllows(token,fetcher))return {status:'FAILED',errorCode:'quota_exhausted',retryAfterMs:86_400_000};
  const response=await fetcher('https://api.line.me/v2/bot/message/broadcast',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-Line-Retry-Key':job.retryKey},body:JSON.stringify({messages:[{type:'text',text:closingBroadcastText}]}),signal:AbortSignal.timeout(8000)});
  const acceptedRequestId=response.headers.get('x-line-accepted-request-id')??undefined;
  if(response.ok)return {status:'SENT',httpStatus:response.status,acceptedRequestId};
  if(response.status===409&&acceptedRequestId)return {status:'SENT',httpStatus:409,acceptedRequestId};
  if(response.status===429)return {status:'FAILED',httpStatus:429,errorCode:'rate_limited',retryAfterMs:5000};
  return {status:'FAILED',httpStatus:response.status,errorCode:'line_http_error',retryAfterMs:response.status>=500?5000:86_400_000};
 }catch(error){if(error instanceof Error&&error.message==='quota_rate_limited')return {status:'FAILED',httpStatus:429,errorCode:'quota_rate_limited',retryAfterMs:5000};return {status:'UNKNOWN',errorCode:error instanceof Error&&error.message==='quota_check_failed'?'quota_check_failed':'network_unknown',retryAfterMs:5000}}
}

async function claim(pool:Pool):Promise<ClaimedJob|null>{
 const client=await pool.connect();try{await client.query('BEGIN');
  const selected=await client.query(`SELECT o.round_id,o.retry_key,o.attempts,r.closes_at,r.status AS round_status FROM round_line_broadcast_outbox o JOIN rounds r ON r.id=o.round_id
   WHERE r.epoch_id=current_round_epoch_id() AND o.status IN ('PENDING','FAILED','UNKNOWN','SENDING') AND o.attempts<5 AND o.error_code IS DISTINCT FROM 'window_elapsed' AND o.error_code IS DISTINCT FROM 'round_not_open' AND o.next_attempt_at<=clock_timestamp() AND (o.lease_until IS NULL OR o.lease_until<clock_timestamp())
   ORDER BY o.next_attempt_at,o.round_id LIMIT 1 FOR UPDATE OF o SKIP LOCKED`);
  const row=selected.rows[0];if(!row){await client.query('COMMIT');return null}
  await client.query("UPDATE round_line_broadcast_outbox SET status='SENDING',attempts=attempts+1,lease_until=clock_timestamp()+interval '30 seconds',updated_at=clock_timestamp() WHERE round_id=$1",[row.round_id]);
  await client.query('COMMIT');return {roundId:String(row.round_id),retryKey:String(row.retry_key),attempts:Number(row.attempts)+1,closesAt:new Date(row.closes_at).toISOString(),roundStatus:String(row.round_status)};
 }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}

export async function dispatchClosingBroadcast(pool:Pool=database(),token=process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN,fetcher:typeof fetch=fetch){
 const job=await claim(pool);if(!job)return null;
 const state=await pool.query('SELECT status,clock_timestamp() AS now FROM rounds WHERE id=$1',[job.roundId]);
 const outcome:BroadcastOutcome=job.roundStatus!=='OPEN'||state.rows[0]?.status!=='OPEN'
  ?{status:'FAILED',errorCode:'round_not_open',retryAfterMs:86_400_000}
  :Date.parse(state.rows[0].now)>=Date.parse(job.closesAt)
  ?{status:'FAILED',errorCode:'window_elapsed',retryAfterMs:86_400_000}
  :await sendClosingBroadcast(job,token,fetcher);
 await pool.query(`UPDATE round_line_broadcast_outbox SET status=$2,last_http_status=$3,accepted_request_id=$4,error_code=$5,
  sent_at=CASE WHEN $2='SENT' THEN clock_timestamp() ELSE NULL END,
  next_attempt_at=clock_timestamp()+$6 * interval '1 millisecond',lease_until=NULL,updated_at=clock_timestamp()
  WHERE round_id=$1 AND status='SENDING' AND attempts=$7`,[job.roundId,outcome.status,outcome.httpStatus??null,outcome.acceptedRequestId??null,outcome.errorCode??null,outcome.retryAfterMs??0,job.attempts]);
 return {roundId:job.roundId,...outcome};
}
