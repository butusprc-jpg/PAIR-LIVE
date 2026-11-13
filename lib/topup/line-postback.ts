import {createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {parsePostback,statusCard} from './line-card';
import {pushLine,verifiedLineAdmin} from './line-provider';
import {decideTopup,TopupError,uuid} from './store';
import {dispatchApprovedMemberLine,enqueueApprovedMemberLine} from './member-line-notify';
export type PostbackEvent={webhookEventId:string;type:'postback';userId:string;data:string};
async function currentRequest(client:PoolClient,id:string){
 const q=await client.query("SELECT r.id,r.member_id,r.status,r.requested_points AS points,r.created_at AS \"createdAt\",m.display_name AS \"displayName\",(r.slip_object_key IS NOT NULL) AS \"hasSlip\" FROM member_topup_requests r JOIN members m ON m.id=r.member_id WHERE r.id=$1",[id]);return q.rows[0] as {id:string;member_id:string;status:string;points:number;createdAt:Date;displayName:string;hasSlip:boolean}|undefined;
}
async function readCurrentRequest(pool:Pool,id:string){
 const client=await pool.connect();
 try{await client.query('BEGIN');await client.query("SELECT set_config('pair_live.topup_admin','true',true)");const row=await currentRequest(client,id);await client.query('COMMIT');return row}
 catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
// Called only after raw-body X-Line-Signature verification. The event row serializes
// retries, while decideTopup's request lock and unique audit are authoritative.
export async function processTopupPostback(pool:Pool,event:PostbackEvent,options:{fetch?:typeof fetch;allowlist?:string}={}){
 const c=await pool.connect();
 let committed=false;
 try{
  await c.query('BEGIN');await c.query("SELECT set_config('pair_live.topup_admin','true',true)");
  await c.query("INSERT INTO line_webhook_events(event_id,event_type,processing_status) VALUES($1,'postback','RECEIVED') ON CONFLICT(event_id) DO NOTHING",[event.webhookEventId]);
  const state=await c.query('SELECT event_type,processing_status FROM line_webhook_events WHERE event_id=$1 FOR UPDATE',[event.webhookEventId]);
  if(state.rows[0]?.event_type!=='postback')throw new TopupError('webhook_event_conflict',409);
  if(state.rows[0]?.processing_status==='PROCESSED'){
   const action=await c.query('SELECT request_id,result,decision FROM member_topup_chat_actions WHERE event_id=$1',[event.webhookEventId]);
   const admin=await verifiedLineAdmin(pool,event.userId,options.allowlist);
   if(admin&&action.rows[0]){
    const previous=action.rows[0];
    const row=await currentRequest(c,previous.request_id);
    await c.query('COMMIT');committed=true;
    const terminal=row&&['APPROVED','REJECTED'].includes(row.status);
    const message=terminal&&['APPROVED','REJECTED'].includes(previous.result)
     ? statusCard(row)
     : terminal?{type:'text',text:`รายการนี้${row.status==='APPROVED'?'อนุมัติแล้ว':'ปฏิเสธแล้ว'} · ${row.points} แต้ม · ${row.displayName.slice(0,80)}`}
     : {type:'text',text:'รายการนี้ยังรอตรวจสอบ กรุณาเปิดรายการล่าสุด'};
    await pushLine(event.userId,[message],`${event.webhookEventId}:status`,options.fetch);
   }else{await c.query('COMMIT');committed=true}
   return {duplicate:true};
  }
  const admin=await verifiedLineAdmin(pool,event.userId,options.allowlist);
  const parsed=parsePostback(event.data,event.userId);
  const actorHash=createHash('sha256').update(event.userId).digest('hex');
  let stage=parsed?.stage||'INVALID',result='IGNORED';
  let row:Awaited<ReturnType<typeof currentRequest>>;
  if(admin&&parsed?.id&&uuid(parsed.id))row=await currentRequest(c,parsed.id);
  if(!admin){stage='DENIED';result='FORBIDDEN';}
  else if(!parsed){result='INVALID';}
  else if(parsed.stage==='CANCEL'){result='CANCELLED';}
  else if(!row){result='NOT_FOUND';}
  else if(row.status!=='PENDING'){
   result='ALREADY_HANDLED';
   if(row.status==='APPROVED')await enqueueApprovedMemberLine(c,{id:row.id,member_id:row.member_id,requested_points:row.points});
  }
  else {
   try{
    if(parsed.decision==='APPROVED'){
     const schema=await c.query("SELECT to_regclass('member_topup_member_notifications') AS relation");
     if(!schema.rows[0]?.relation)throw new TopupError('topup_member_notification_schema_missing',503);
    }
    const decided=await decideTopup(pool,admin.id,row.id,parsed.decision!,'LINE OA postback · evidence reviewed');
    const replayed=decided.replayed===true;
    result=replayed?'ALREADY_HANDLED':decided.status;
    if(decided.status==='APPROVED')await enqueueApprovedMemberLine(c,decided);
   }catch(error){
    if(error instanceof TopupError&&error.code==='terminal_status'){
     const fresh=await currentRequest(c,row.id);result='ALREADY_HANDLED';if(fresh?.status==='APPROVED')await enqueueApprovedMemberLine(c,{id:fresh.id,member_id:fresh.member_id,requested_points:fresh.points});
    }else if(error instanceof TopupError&&['member_suspended','invalid_points','legacy_required','balance_overflow'].includes(error.code)){result='BLOCKED_'+error.code;}
    else throw error;
   }
  }
  await c.query('INSERT INTO member_topup_chat_actions(event_id,request_id,admin_id,actor_hash,stage,decision,result) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(event_id) DO NOTHING',[
   event.webhookEventId,row?.id||null,admin?.id||null,actorHash,stage,parsed?.decision||null,result]);
  await c.query("UPDATE line_webhook_events SET processing_status='PROCESSED',processed_at=now() WHERE event_id=$1",[event.webhookEventId]);
  await c.query('COMMIT');committed=true;
  if(row&&['APPROVED','REJECTED','ALREADY_HANDLED'].includes(result)){
   const latest=await readCurrentRequest(pool,row.id);
   if(latest)row={...row,status:latest.status};
  }
  if(result==='APPROVED'||result==='ALREADY_HANDLED')try{await dispatchApprovedMemberLine(pool,{fetch:options.fetch})}catch{/* Durable outbox retains the work for the retry worker. */}
  if(admin){
   const message=row&&['APPROVED','REJECTED'].includes(result)
     ? statusCard(row)
     : row&&parsed?.decision&&result==='ALREADY_HANDLED'
     ? {type:'text',text:`รายการนี้${row.status==='APPROVED'?'อนุมัติแล้ว':'ปฏิเสธแล้ว'} · ${row.points} แต้ม · ${row.displayName.slice(0,80)}`}
     : {type:'text',text:result==='CANCELLED'?'ยกเลิกแล้ว':result==='NOT_FOUND'?'ไม่พบคำขอเติมแต้ม':result==='INVALID'?'ปุ่มไม่ถูกต้องหรือหมดอายุ กรุณาเปิดรายการใหม่':result.startsWith('BLOCKED_')?`อนุมัติไม่สำเร็จ: ${result.slice(8)}`:`ดำเนินการไม่สำเร็จ: ${result}`};
   await pushLine(event.userId,[message],`${event.webhookEventId}:status`,options.fetch);
  }
  return {duplicate:false,result};
 }catch(error){
  if(!committed){
   try{await c.query('ROLLBACK')}catch{}
   console.error('topup_postback_failed',{eventId:event.webhookEventId,code:error instanceof TopupError?error.code:'unexpected',status:error instanceof TopupError?error.status:undefined});
   try{if(await verifiedLineAdmin(pool,event.userId,options.allowlist))await pushLine(event.userId,[{type:'text',text:`ดำเนินการเติมแต้มไม่สำเร็จ: ${error instanceof TopupError?error.code:'ระบบขัดข้อง กรุณาลองใหม่'}`}],event.webhookEventId+':error',options.fetch)}catch{}
  }
  throw error
 }finally{c.release()}
}
