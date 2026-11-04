import type {Pool,PoolClient} from 'pg';
import {pushLine} from './line-provider';
import {lineAdminRecipients} from './line-notify';
import {TopupError} from './store';

type QueueRow={request_id:string;recipient_user_id:string;approved_points:number;attempts:number};
async function scoped<T>(pool:Pool,run:(client:PoolClient)=>Promise<T>):Promise<T>{
 const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('pair_live.topup_admin','true',true)");const v=await run(c);await c.query('COMMIT');return v}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}

/** Called after decideTopup reports APPROVED; request_id is the unique delivery key. */
export async function requireMemberNotificationSchema(pool:Pool){
 const r=await pool.query("SELECT to_regclass('member_topup_member_notifications') AS relation");
 if(!r.rows[0]?.relation)throw new TopupError('topup_member_notification_schema_missing',503);
}
export async function enqueueApprovedMemberLine(c:PoolClient,row:{id:string;member_id:string;requested_points:number}){
 const channel=process.env.LINE_LOGIN_CHANNEL_ID;
 const matches=channel?(await c.query<{provider_user_id:string}>(
  `SELECT i.provider_user_id FROM member_identities i WHERE i.member_id=$1 AND i.provider='line' AND i.provider_channel_id=$2
   AND NOT EXISTS (SELECT 1 FROM admin_identities a WHERE a.provider='line' AND a.provider_channel_id=$2
     AND a.provider_user_id=i.provider_user_id AND a.status='active')
   ORDER BY i.last_login_at DESC LIMIT 1`,[row.member_id,channel])).rows:[];
 const candidate=matches[0]?.provider_user_id;
 const recipient=candidate&&/^U[0-9a-f]{32}$/i.test(candidate)&&!lineAdminRecipients(process.env.ADMIN_AUTH_ALLOWLIST_JSON).includes(candidate)?candidate:null;
 await c.query(`INSERT INTO member_topup_member_notifications(request_id,member_id,recipient_user_id,approved_points,status,last_error)
  VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(request_id) DO NOTHING`,
  [row.id,row.member_id,recipient,row.requested_points,recipient?'PENDING':'FAILED',recipient?null:'member_line_unavailable']);
}
export async function queueApprovedMemberLine(pool:Pool,row:{id:string;member_id:string;requested_points:number}){
 return scoped(pool,c=>enqueueApprovedMemberLine(c,row));
}

/** Provider-accepted means LINE accepted the push, not that a member opened it. */
export async function dispatchApprovedMemberLine(pool:Pool,opts:{fetch?:typeof fetch;token?:string}={}){
 const token=opts.token??process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
 if(!token)return {configured:false,sent:0,retry:0,failed:0};
 const rows=await scoped(pool,async c=>{
  await c.query(`UPDATE member_topup_member_notifications SET status='FAILED',lease_until=NULL,
   last_error='retry_window_expired',updated_at=now()
   WHERE (status IN ('PENDING','RETRY') AND created_at<now()-interval '23 hours')
      OR (status='PROCESSING' AND lease_until<now() AND (attempts>=5 OR created_at<now()-interval '23 hours'))`);
  return (await c.query<QueueRow>(`WITH candidate AS (
   SELECT request_id FROM member_topup_member_notifications
   WHERE ((status IN ('PENDING','RETRY') AND next_attempt_at<=now()) OR (status='PROCESSING' AND lease_until<now()))
   AND attempts<5 AND created_at>now()-interval '23 hours' AND recipient_user_id IS NOT NULL
   ORDER BY created_at,request_id FOR UPDATE SKIP LOCKED LIMIT 10
  ) UPDATE member_topup_member_notifications n SET status='PROCESSING',attempts=n.attempts+1,
    lease_until=now()+interval '40 seconds',updated_at=now()
    FROM candidate WHERE n.request_id=candidate.request_id
    RETURNING n.request_id,n.recipient_user_id,n.approved_points,n.attempts`)).rows;
 });
 let sent=0,retry=0,failed=0;
 for(const row of rows){
  let status:'SENT'|'RETRY'|'FAILED'='SENT';let code:string|null=null;
  try{await pushLine(row.recipient_user_id,[{type:'text',text:`✅ เติมจำนวน ${row.approved_points} แต้มที่ต้องการแล้ว`}],row.request_id,opts.fetch,token)}
  catch(e){const http=e instanceof Error&&'status' in e?Number((e as {status:number}).status):503;
   const temporary=http===503||http===429||http>=500;
   status=temporary&&row.attempts<5?'RETRY':'FAILED';code=temporary?'line_temporary':'line_rejected';
  }
  const backoff=Math.min(3600,30*2**(row.attempts-1));
  const changed=await scoped(pool,async c=>c.query(`UPDATE member_topup_member_notifications SET status=$2,lease_until=NULL,
    next_attempt_at=now()+($3::integer*interval '1 second'),sent_at=CASE WHEN $2='SENT' THEN now() ELSE sent_at END,
    last_error=$4,updated_at=now() WHERE request_id=$1 AND status='PROCESSING' AND attempts=$5 AND lease_until>now()
    RETURNING request_id`,[row.request_id,status,backoff,code,row.attempts]));
  if(changed.rowCount===1){if(status==='SENT')sent++;else if(status==='RETRY')retry++;else failed++}
 }
 return {configured:true,sent,retry,failed};
}
