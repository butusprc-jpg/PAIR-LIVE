import type {Pool} from 'pg';
import {createLineAdminAdapter} from '../../modules/report-notification/server/line-admin-adapter';

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
export type LineNotifyOutcome={configured:boolean;sent:number;pending:number;failed:number};
type QueueRow={id:string;request_id:string;recipient_user_id:string;requested_points:number;display_name:string;has_slip:boolean;attempts:number};
async function scoped<T>(pool:Pool,action:(client:import('pg').PoolClient)=>Promise<T>):Promise<T>{
 const c=await pool.connect();
 try{await c.query('BEGIN');await c.query("SELECT set_config('pair_live.topup_admin','true',true)");const v=await action(c);await c.query('COMMIT');return v}
 catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
export async function dispatchTopupLine(pool:Pool,opts:{token?:string;fetch?:typeof fetch;origin?:string}={}):Promise<LineNotifyOutcome>{
 const token=opts.token??process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
 if(!token)return {configured:false,sent:0,pending:0,failed:0};
 // Every claim receives a stable UUID retry key. A 40s lease survives a crashed function.
 const rows=await scoped(pool,async c=>(await c.query<QueueRow>(`
 WITH candidate AS (
   SELECT n.id FROM member_topup_line_notifications n
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
  m.display_name,(r.slip_object_key IS NOT NULL) AS has_slip
 FROM claimed n JOIN member_topup_requests r ON r.id=n.request_id
 JOIN members m ON m.id=n.member_id
 `)).rows);
 const adapter=createLineAdminAdapter({channelAccessToken:token,fetch:opts.fetch,timeoutMs:8000});
 let sent=0,pending=0,failed=0;
 const origin=(opts.origin??process.env.NEXT_PUBLIC_APP_BASE_URL??'https://pair-live.vercel.app').replace(/\/$/,'');
 for(const row of rows){
  // Short, non-sensitive notification; the slip is viewed only via authenticated admin API.
  const name=row.display_name.replace(/[\r\n]/g,' ').slice(0,80);
  const content={text:`🔔 PAIR LIVE · เติมแต้มรอตรวจสอบ\nสมาชิก: ${name}\nจำนวน: ${row.requested_points.toLocaleString('th-TH')} แต้ม\nสลิป: ${row.has_slip?'แนบแล้ว':'ไม่มีสลิป'}\nเลขคำขอ: ${row.request_id}\nตรวจและอนุมัติ: ${origin}/admin`};
  const result=await adapter.send({id:row.id,address:row.recipient_user_id} as Parameters<ReturnType<typeof createLineAdminAdapter>['send']>[0],content);
  let status:'SENT'|'RETRY'|'FAILED';
  if(result.status==='ACCEPTED'){status='SENT';sent++}
  else if(result.status==='TEMPORARY_ERROR'&&row.attempts<5){status='RETRY';pending++}
  else {status='FAILED';failed++}
  const backoff=Math.min(3600,Math.max(30,result.retryAfterMs?Math.ceil(result.retryAfterMs/1000):30*Math.pow(2,row.attempts-1)));
  await scoped(pool,async c=>{await c.query(`UPDATE member_topup_line_notifications SET status=$2,lease_until=NULL,
   next_attempt_at=now()+($3::integer*interval '1 second'),sent_at=CASE WHEN $2='SENT' THEN now() ELSE NULL END,
   last_error=$4,updated_at=now()
   WHERE id=$1 AND status='PROCESSING' AND attempts=$5`,[row.id,status,backoff,status==='SENT'?null:result.code||result.status,row.attempts])});
 }
 return {configured:true,sent,pending,failed};
}
export async function topupLineDeliverySummary(pool:Pool){
 return scoped(pool,async c=>(await c.query(`SELECT status,count(*)::integer AS count FROM member_topup_line_notifications GROUP BY status ORDER BY status`)).rows);
}
