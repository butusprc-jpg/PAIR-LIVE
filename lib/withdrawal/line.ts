import type {Pool,PoolClient} from 'pg';
import {pushLine,verifiedLineAdmin} from '../topup/line-provider';
import {decideWithdrawal} from './store';

type QueueRow={id:string;request_id:string;recipient_user_id:string;purpose:string;attempts:number;requested_points:number;payout_details:string;display_name:string;status:string};
async function scoped<T>(pool:Pool,fn:(c:PoolClient)=>Promise<T>):Promise<T>{
 const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('pair_live.topup_admin','true',true)");const v=await fn(c);await c.query('COMMIT');return v}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
export function withdrawalCard(row:{id:string;display_name:string;requested_points:number;payout_details:string}){
 return {type:'flex',altText:`PAIR LIVE · ขอถอน ${row.requested_points} แต้ม`,contents:{
  type:'bubble',size:'mega',
  body:{type:'box',layout:'vertical',spacing:'md',contents:[
   {type:'text',text:'PAIR LIVE — คำขอถอนแต้ม',weight:'bold',size:'lg',wrap:true},
   {type:'text',text:`สมาชิก: ${row.display_name.slice(0,80)}`,wrap:true},
   {type:'text',text:`ถอน: ${row.requested_points.toLocaleString('th-TH')} แต้ม`,wrap:true},
   {type:'text',text:`ข้อมูลรับแต้ม: ${row.payout_details}`,wrap:true},
   {type:'text',text:`เลขคำขอ: ${row.id}`,size:'xs',wrap:true},
   {type:'text',text:'ตรวจข้อมูลและจ่ายแต้มให้สมาชิกก่อนกดยืนยัน',size:'sm',wrap:true}
  ]},
  footer:{type:'box',layout:'vertical',spacing:'sm',contents:[
   {type:'button',style:'primary',color:'#1763DC',action:{type:'postback',label:'✅ ยืนยันจ่ายแต้มแล้ว',data:`withdraw:v1:transfer:${row.id}`}},
   {type:'button',style:'secondary',action:{type:'postback',label:'❌ ปฏิเสธ',data:`withdraw:v1:reject:${row.id}`}}
  ]}
 }};
}
export async function dispatchWithdrawalLine(pool:Pool,opts:{fetch?:typeof fetch}={}){
 const rows=await scoped(pool,async c=>(await c.query<QueueRow>(`
  WITH candidate AS (
   SELECT id FROM member_withdrawal_line_outbox
   WHERE ((status IN ('PENDING','RETRY') AND next_attempt_at<=now())
     OR (status='PROCESSING' AND lease_until<now()))
   AND attempts<5
   ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 10
  )
  UPDATE member_withdrawal_line_outbox o
  SET status='PROCESSING',attempts=o.attempts+1,lease_until=now()+interval '40 seconds'
  FROM candidate
  WHERE o.id=candidate.id
  RETURNING o.id,o.request_id,o.recipient_user_id,o.purpose,o.attempts,
    (SELECT requested_points FROM member_withdrawal_requests WHERE id=o.request_id) AS requested_points,
    (SELECT payout_details FROM member_withdrawal_requests WHERE id=o.request_id) AS payout_details,
    (SELECT m.display_name FROM member_withdrawal_requests r JOIN members m ON m.id=r.member_id WHERE r.id=o.request_id) AS display_name,
    (SELECT status FROM member_withdrawal_requests WHERE id=o.request_id) AS status
 `)).rows);
 let sent=0,retry=0,failed=0;
 for(const row of rows){
  let status='SENT',error:null|string=null;
  const message=row.purpose==='ADMIN_REQUEST'?
   (row.status==='PENDING'?withdrawalCard(row):{type:'text',text:`คำขอถอน ${row.requested_points} แต้ม · สถานะล่าสุด ${row.status}`})
   :{type:'text',text:row.purpose==='MEMBER_TRANSFERRED'?
    `✅ จ่ายแต้มแล้ว · ${row.requested_points} แต้ม · เลขคำขอ ${row.request_id}`:
    `❌ คำขอถอนแต้มถูกปฏิเสธ คืน ${row.requested_points} แต้มแล้ว · เลขคำขอ ${row.request_id}`};
  try{await pushLine(row.recipient_user_id,[message],row.id,opts.fetch)}
  catch(e){const code=e instanceof Error&&'status' in e?Number((e as {status:number}).status):503;status=(code===503||code===429||code>=500)&&row.attempts<5?'RETRY':'FAILED';error='line_delivery_failed'}
  await scoped(pool,c=>c.query("UPDATE member_withdrawal_line_outbox SET status=$2,lease_until=NULL,next_attempt_at=now()+($3::integer*interval '1 second'),last_error=$4,sent_at=CASE WHEN $2='SENT' THEN now() ELSE sent_at END WHERE id=$1 AND status='PROCESSING' AND attempts=$5",[row.id,status,Math.min(3600,30*2**(row.attempts-1)),error,row.attempts]));
  if(status==='SENT')sent++;else if(status==='RETRY')retry++;else failed++;
 }
 return {sent,retry,failed};
}
async function sendWithdrawalAck(to:string,text:string,retryId:string,replyToken?:string,fetcher:typeof fetch=fetch){
 const token=process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
 if(replyToken&&token){
  try{
   const res=await fetcher('https://api.line.me/v2/bot/message/reply',{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({replyToken,messages:[{type:'text',text}]}),signal:AbortSignal.timeout(6000)});
   if(res.ok)return;
   console.warn('withdraw_reply_status',res.status);
  }catch(err){console.warn('withdraw_reply_error',err instanceof Error?err.name:'unknown')}
 }
 await pushLine(to,[{type:'text',text}],retryId,fetcher);
}
export async function processWithdrawalPostback(pool:Pool,event:{webhookEventId:string;userId:string;data:string;replyToken?:string},opts:{fetch?:typeof fetch;allowlist?:string}={}){
 const match=/^withdraw:v1:(transfer|reject):([0-9a-f-]{36})$/i.exec(event.data);
 if(!match)return {result:'INVALID'};
 await scoped(pool,c=>c.query("INSERT INTO line_webhook_events(event_id,event_type,processing_status) VALUES($1,'postback','RECEIVED') ON CONFLICT(event_id) DO NOTHING",[event.webhookEventId]));
 const admin=await verifiedLineAdmin(pool,event.userId,opts.allowlist);
 if(!admin){console.error('withdraw_admin_not_verified');return {result:'FORBIDDEN'}};
 // Request-level locks and the immutable unique audit are authoritative against replay.
 const decision=match[1]==='transfer'?'TRANSFERRED':'REJECTED';
 let row:Awaited<ReturnType<typeof decideWithdrawal>>;
 try{row=await decideWithdrawal(pool,admin.id,match[2],decision)}catch(error){console.error('withdraw_decision_failed',error instanceof Error?error.message:'unknown');try{await pushLine(event.userId,[{type:'text',text:'ยืนยันถอนแต้มไม่สำเร็จ กรุณาตรวจรายการล่าสุด'}],event.webhookEventId+':error',opts.fetch)}catch{}throw error}
 await scoped(pool,async c=>{await c.query('INSERT INTO member_withdrawal_postbacks(event_id,request_id,result) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[event.webhookEventId,row.id,row.status]);await c.query("UPDATE line_webhook_events SET processing_status='PROCESSED',processed_at=now() WHERE event_id=$1",[event.webhookEventId]);});
 const message={type:'text',text:row.replayed?
  `รายการนี้ดำเนินการแล้ว · ${row.status} · ${row.requested_points} แต้ม`:
  row.status==='TRANSFERRED'?`✅ ยืนยันจ่ายแต้มแล้ว · ${row.requested_points} แต้ม`:`❌ ปฏิเสธและคืน ${row.requested_points} แต้มแล้ว`};
 try{await sendWithdrawalAck(event.userId,message.text,event.webhookEventId,event.replyToken,opts.fetch)}catch(error){console.error('withdraw_ack_failed',error instanceof Error?error.message:'unknown')}
 try{await dispatchWithdrawalLine(pool,{fetch:opts.fetch})}catch(error){console.error('withdraw_notification_dispatch_failed',error instanceof Error?error.message:'unknown')}
 return {result:row.status,replayed:row.replayed};
}
