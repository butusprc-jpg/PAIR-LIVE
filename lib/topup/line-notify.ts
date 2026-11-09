import type {Pool} from 'pg';
import {getSlip} from './slip';
import {requestCard,signedSlipUrl} from './line-card';
import {pushLine} from './line-provider';

// Users in the admin allowlist are selected server-side only. LINE Login and
// Messaging API must share the same LINE provider, and the admin must be an OA friend.
export function lineAdminRecipients(raw:string|undefined):string[]{
 if(!raw)return [];
 try {
  const entries=JSON.parse(raw);
  if(!Array.isArray(entries))return [];
  return [...new Set(entries.filter((e:unknown):e is {userId:string;role:string}=>!!e&&typeof e==='object'&&'role' in e&&'userId' in e&&e.role==='admin'&&typeof e.userId==='string'&&/^U[0-9a-f]{32}$/i.test(e.userId)).map(e=>e.userId))];
 }catch{return []}
}
export async function activeLineAdminRecipients(pool:Pool,raw:string|undefined):Promise<string[]>{
 const channel=process.env.LINE_LOGIN_CHANNEL_ID;
 if(!channel)return [];
 const legacy=lineAdminRecipients(raw);
 const result=await pool.query<{provider_user_id:string;role:string|null;status:string}>("SELECT provider_user_id,role,status FROM admin_identities WHERE provider='line' AND provider_channel_id=$1",[channel]);
 const known=new Map(result.rows.map(row=>[row.provider_user_id,row]));
 return [...new Set([...legacy,...result.rows.map(row=>row.provider_user_id)])].filter(userId=>{
  const row=known.get(userId);
  return !row?legacy.includes(userId):row.status==='active'&&(row.role==='admin'||row.role===null&&legacy.includes(userId));
 });
}
export type LineNotifyOutcome={configured:boolean;sent:number;pending:number;failed:number};
type QueueRow={id:string;request_id:string;recipient_user_id:string;requested_points:number;display_name:string;created_at:Date;status:string;has_slip:boolean;attempts:number};
async function scoped<T>(pool:Pool,action:(client:import('pg').PoolClient)=>Promise<T>):Promise<T>{
 const c=await pool.connect();
 try{await c.query('BEGIN');await c.query("SELECT set_config('pair_live.topup_admin','true',true)");const v=await action(c);await c.query('COMMIT');return v}
 catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
export async function dispatchTopupLine(pool:Pool,opts:{token?:string;fetch?:typeof fetch;origin?:string;loadSlip?:(id:string)=>Promise<{data:Buffer;type:string}>}={}):Promise<LineNotifyOutcome>{
 const token=opts.token??process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
 if(!token)return {configured:false,sent:0,pending:0,failed:0};
 // Every claim receives a stable UUID retry key. A 40s lease survives a crashed function.
 const rows=await scoped(pool,async c=>(await c.query<QueueRow>(`
 WITH candidate AS (
   SELECT n.id FROM member_topup_line_notifications n
   JOIN member_topup_requests r ON r.id=n.request_id AND r.oa_id IS NULL
   WHERE (
     (n.status IN ('PENDING','RETRY') AND n.next_attempt_at<=now())
     OR (n.status='PROCESSING' AND n.lease_until<now())
   ) AND n.attempts<5 AND n.created_at>now()-interval '23 hours'
   ORDER BY n.created_at,n.id FOR UPDATE SKIP LOCKED LIMIT 10
 ), claimed AS (
   UPDATE member_topup_line_notifications n SET status='PROCESSING',
     attempts=n.attempts+1,lease_until=now()+interval '40 seconds',updated_at=now()
   FROM candidate WHERE n.id=candidate.id RETURNING n.*
 )
 SELECT n.id,n.request_id,n.recipient_user_id,n.attempts,r.requested_points,
  m.display_name,r.created_at,r.status,(r.slip_object_key IS NOT NULL) AS has_slip
 FROM claimed n JOIN member_topup_requests r ON r.id=n.request_id
 JOIN members m ON m.id=n.member_id
 `)).rows);
 let sent=0,pending=0,failed=0;
 const origin=(opts.origin??process.env.NEXT_PUBLIC_APP_BASE_URL??'https://pair-live.vercel.app').replace(/\/$/,'');
 for(const row of rows){
  const rowData={id:row.request_id,displayName:row.display_name,points:row.requested_points,createdAt:row.created_at,status:'รอตรวจสอบ'};
  let slipUrl:string|undefined;
  let expired=false;
  if(row.has_slip){
   try{
    // Read and verify the R2 object before advertising a fetchable image.
    const slip=await (opts.loadSlip??((id:string)=>getSlip(pool,id)))(row.request_id);
    if(slip.data.length>2*1024*1024||!['image/png','image/jpeg','image/webp'].includes(slip.type))throw Error('slip_invalid');
    slipUrl=signedSlipUrl(origin,row.request_id,Date.now(),row.created_at);
   }catch(e){slipUrl=undefined;expired=e instanceof Error&&e.message==='slip_expired'}
  }
  let result:{status:'ACCEPTED'|'TEMPORARY_ERROR'|'PERMANENT_ERROR';code?:string;retryAfterMs?:number};
  try{await pushLine(row.recipient_user_id,[requestCard(rowData,slipUrl,expired,!row.has_slip)],row.id,opts.fetch,token);result={status:'ACCEPTED'}}
  catch(e){result={status:e instanceof Error&&'status' in e&&(e as {status:number}).status===422?'PERMANENT_ERROR':'TEMPORARY_ERROR',code:e instanceof Error?e.message:'line_transport'}}
  let status:'SENT'|'RETRY'|'FAILED';
  if(result.status==='ACCEPTED'){status='SENT';sent++}
  else if(result.status==='TEMPORARY_ERROR'&&row.attempts<5){status='RETRY';pending++}
  else {status='FAILED';failed++}
  const backoff=Math.min(3600,Math.max(30,result.retryAfterMs?Math.ceil(result.retryAfterMs/1000):30*Math.pow(2,row.attempts-1)));
  await scoped(pool,async c=>{await c.query(`UPDATE member_topup_line_notifications SET status=$2,lease_until=NULL,
   next_attempt_at=now()+($3::integer*interval '1 second'),sent_at=CASE WHEN $2='SENT' THEN now() ELSE NULL END,
   last_error=$4,updated_at=now()
   WHERE id=$1 AND status='PROCESSING' AND attempts=$5`,[row.id,status,backoff,status==='SENT'?(row.has_slip&&!slipUrl?'slip_image_unavailable':null):result.code||result.status,row.attempts])});
 }
 return {configured:true,sent,pending,failed};
}
export async function topupLineDeliverySummary(pool:Pool){
 return scoped(pool,async c=>(await c.query(`SELECT status,count(*)::integer AS count FROM member_topup_line_notifications GROUP BY status ORDER BY status`)).rows);
}
