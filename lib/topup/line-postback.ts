import {createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {confirmationCard,parsePostback,resultMessage} from './line-card';
import {pushLine,verifiedLineAdmin} from './line-provider';
import {decideTopup,TopupError,uuid} from './store';
export type PostbackEvent={webhookEventId:string;type:'postback';userId:string;data:string};
async function currentRequest(client:PoolClient,id:string){
 const q=await client.query("SELECT r.id,r.status,r.requested_points AS points,r.created_at AS \"createdAt\",m.display_name AS \"displayName\",(r.slip_object_key IS NOT NULL) AS \"hasSlip\" FROM member_topup_requests r JOIN members m ON m.id=r.member_id WHERE r.id=$1",[id]);return q.rows[0] as {id:string;status:string;points:number;createdAt:Date;displayName:string;hasSlip:boolean}|undefined;
}
// Called only after raw-body X-Line-Signature verification. The event row serializes
// retries, while decideTopup's request lock and unique audit are authoritative.
export async function processTopupPostback(pool:Pool,event:PostbackEvent,options:{fetch?:typeof fetch;allowlist?:string}={}){
 const c=await pool.connect();
 try{
  await c.query('BEGIN');await c.query("SELECT set_config('pair_live.topup_admin','true',true)");
  await c.query("INSERT INTO line_webhook_events(event_id,event_type,processing_status) VALUES($1,'postback','RECEIVED') ON CONFLICT(event_id) DO NOTHING",[event.webhookEventId]);
  const state=await c.query('SELECT event_type,processing_status FROM line_webhook_events WHERE event_id=$1 FOR UPDATE',[event.webhookEventId]);
  if(state.rows[0]?.event_type!=='postback')throw new TopupError('webhook_event_conflict',409);
  if(state.rows[0]?.processing_status==='PROCESSED'){await c.query('COMMIT');return {duplicate:true}}
  const admin=await verifiedLineAdmin(pool,event.userId,options.allowlist);
  const parsed=parsePostback(event.data,event.userId);
  const actorHash=createHash('sha256').update(event.userId).digest('hex');
  let stage=parsed?.stage||'INVALID',result='IGNORED',message:unknown=null;
  let row:Awaited<ReturnType<typeof currentRequest>>;
  if(admin&&parsed?.id&&uuid(parsed.id))row=await currentRequest(c,parsed.id);
  if(!admin){stage='DENIED';result='FORBIDDEN';message={type:'text',text:'คุณไม่มีสิทธิ์อนุมัติคำขอเติมแต้ม'};}
  else if(!parsed){result='INVALID';message={type:'text',text:'คำสั่งไม่ถูกต้องหรือหมดอายุ กรุณากดจากการ์ดรายการล่าสุด'};}
  else if(parsed.stage==='CANCEL'){result='CANCELLED';message={type:'text',text:'ยกเลิกการดำเนินรายการแล้ว'};}
  else if(!row){result='NOT_FOUND';message={type:'text',text:'ไม่พบคำขอเติมแต้ม'};}
  else if(row.status!=='PENDING'){result='ALREADY_HANDLED';message={type:'text',text:`รายการ ${row.id} ดำเนินการแล้ว · ${row.status}`};}
  else if(parsed.stage==='REVIEW'){result='AWAITING_CONFIRMATION';message=confirmationCard(row,parsed.decision!,event.userId);}
  else {
   try{
    const decided=await decideTopup(pool,admin.id,row.id,parsed.decision!,row.hasSlip?'LINE OA postback':'LINE OA postback · slip reviewed in chat');
    const replayed=decided.replayed===true;
    result=replayed?'ALREADY_HANDLED':decided.status;
    message=resultMessage(row,parsed.decision!,admin.name,replayed);
   }catch(error){
    if(error instanceof TopupError&&error.code==='terminal_status'){
     const fresh=await currentRequest(c,row.id);result='ALREADY_HANDLED';message={type:'text',text:`รายการ ${row.id} ดำเนินการแล้ว · ${fresh?.status||'UNKNOWN'}`};
    }else if(error instanceof TopupError&&['member_suspended','invalid_points','legacy_required','balance_overflow'].includes(error.code)){result='BLOCKED_'+error.code;message={type:'text',text:`คำขอ ${row.id} ยังทำรายการไม่ได้ (${error.code}) กรุณาตรวจสอบก่อนลองใหม่`};}
    else throw error;
   }
  }
  await c.query('INSERT INTO member_topup_chat_actions(event_id,request_id,admin_id,actor_hash,stage,decision,result) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(event_id) DO NOTHING',[
   event.webhookEventId,row?.id||null,admin?.id||null,actorHash,stage,parsed?.decision||null,result]);
  if(message)await pushLine(event.userId,[message],event.webhookEventId,options.fetch);
  await c.query("UPDATE line_webhook_events SET processing_status='PROCESSED',processed_at=now() WHERE event_id=$1",[event.webhookEventId]);
  await c.query('COMMIT');return {duplicate:false,result};
 }catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
}
