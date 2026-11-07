import type {Pool} from 'pg';
import {OwnerError} from './errors';
import {verifyConnectedBot} from './verify-bot';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const oaId=/^@[A-Za-z0-9_-]{1,79}$/;
export type OwnerActor={channelId:string;userId:string};
type Row={id:string;line_oa_id:string;shop_name:string;enabled:boolean;paused:boolean;deleted_at:Date|null;verified_token_hash:string|null;expires_at:Date;created_at:Date;updated_at:Date};
function publicRow(row:Row,now:Date){return {id:row.id,lineOaId:row.line_oa_id,shopName:row.shop_name,enabled:row.enabled,paused:row.paused,expiresAt:row.expires_at,createdAt:row.created_at,updatedAt:row.updated_at,status:row.deleted_at?'REMOVED':!row.enabled?'DISABLED':row.paused?'PAUSED':row.expires_at<=now?'EXPIRED':'ACTIVE'}}
function expiry(value:unknown){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new OwnerError('invalid_expiry',400);const date=new Date(value+'T23:59:59.999+07:00');if(Number.isNaN(date.getTime())||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(date)!==value)throw new OwnerError('invalid_expiry',400);return date}
export async function listOas(db:Pool){const now=new Date(),result=await db.query<Row>('SELECT * FROM oa_service_control WHERE deleted_at IS NULL ORDER BY created_at DESC,id DESC');const rows=result.rows.map(row=>publicRow(row,now));return {rows,total:rows.length,active:rows.filter(row=>row.status==='ACTIVE').length}}
export async function changeOa(db:Pool,actor:OwnerActor,input:Record<string,unknown>,verifyBot=verifyConnectedBot){const key=input.requestKey;if(typeof key!=='string'||!uuid.test(key))throw new OwnerError('invalid_request_key',400);const action=input.action;if(!['add','enable','disable','pause','resume','remove','setExpiry','extend30'].includes(String(action)))throw new OwnerError('invalid_action',400);
 const client=await db.connect();try{await client.query('BEGIN');
 // Serialize all owner changes, including duplicate inserts and the single-connected-OA invariant.
 await client.query('SELECT pg_advisory_xact_lock(748201,22)');
 const previous=await client.query<{oa_id:string;action:string}>('SELECT oa_id,action FROM oa_service_audit WHERE request_key=$1',[key]);
 if(previous.rows[0]){const expected={add:'ADD',enable:'ENABLE',disable:'DISABLE',setExpiry:'SET_EXPIRY',extend30:'EXTEND_30_DAYS',pause:'PAUSE',resume:'RESUME',remove:'REMOVE'}[action as 'add'|'enable'|'disable'|'setExpiry'|'extend30'|'pause'|'resume'|'remove'];if(previous.rows[0].action!==expected||action!=='add'&&previous.rows[0].oa_id!==input.id)throw new OwnerError('idempotency_conflict',409);const row=await client.query<Row>('SELECT * FROM oa_service_control WHERE id=$1',[previous.rows[0].oa_id]);if(action==='add'&&row.rows[0]?.line_oa_id!==input.lineOaId)throw new OwnerError('idempotency_conflict',409);await client.query('COMMIT');return publicRow(row.rows[0],new Date())}
 let before:Row|undefined,row:Row,verb:string;
 if(action==='add'){
  if(typeof input.lineOaId!=='string'||!oaId.test(input.lineOaId)||typeof input.shopName!=='string'||!input.shopName.trim()||input.shopName.trim().length>160)throw new OwnerError('invalid_oa',400);
  const expiresAt=expiry(input.expiresAt);const added=await client.query<Row>(`INSERT INTO oa_service_control(line_oa_id,shop_name,enabled,paused,expires_at) VALUES($1,$2,false,false,$3) ON CONFLICT(line_oa_id) DO UPDATE SET shop_name=excluded.shop_name,enabled=false,paused=false,verified_token_hash=NULL,expires_at=excluded.expires_at,deleted_at=NULL,updated_at=now() WHERE oa_service_control.deleted_at IS NOT NULL RETURNING *`,[input.lineOaId,input.shopName.trim(),expiresAt]);if(!added.rows[0])throw new OwnerError('oa_duplicate',409);row=added.rows[0];verb='ADD';
 }else{
  if(typeof input.id!=='string'||!uuid.test(input.id))throw new OwnerError('invalid_oa_id',400);const found=await client.query<Row>('SELECT * FROM oa_service_control WHERE id=$1 FOR UPDATE',[input.id]);before=found.rows[0];if(!before||before.deleted_at)throw new OwnerError('oa_not_found',404);verb=action==='enable'?'ENABLE':action==='disable'?'DISABLE':action==='pause'?'PAUSE':action==='resume'?'RESUME':action==='remove'?'REMOVE':action==='setExpiry'?'SET_EXPIRY':'EXTEND_30_DAYS';
  if(action==='enable'){
   // A configured, verified single-OA binding is required before service may be enabled.
   if(process.env.CONNECTED_LINE_OA_ID!==before.line_oa_id||!process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN)throw new OwnerError('oa_binding_unverified',409);
   if(before.expires_at<=new Date())throw new OwnerError('oa_expired',409);
   const tokenHash=await verifyBot(before.line_oa_id,process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN);
   const other=await client.query('SELECT 1 FROM oa_service_control WHERE id<>$1 AND enabled=true AND deleted_at IS NULL LIMIT 1',[before.id]);if(other.rowCount)throw new OwnerError('multi_oa_not_supported',409);
   row=(await client.query<Row>('UPDATE oa_service_control SET enabled=true,paused=false,verified_token_hash=$2,updated_at=now() WHERE id=$1 RETURNING *',[before.id,tokenHash])).rows[0];
  }else if(action==='disable')row=(await client.query<Row>('UPDATE oa_service_control SET enabled=false,paused=false,updated_at=now() WHERE id=$1 RETURNING *',[before.id])).rows[0];
  else if(action==='pause'){
   if(!before.enabled||before.paused)throw new OwnerError('oa_not_active',409);
   row=(await client.query<Row>('UPDATE oa_service_control SET paused=true,updated_at=now() WHERE id=$1 RETURNING *',[before.id])).rows[0];
  }else if(action==='resume'){
   if(!before.enabled||!before.paused)throw new OwnerError('oa_not_paused',409);
   if(before.expires_at<=new Date())throw new OwnerError('oa_expired',409);
   if(process.env.CONNECTED_LINE_OA_ID!==before.line_oa_id||!process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN)throw new OwnerError('oa_binding_unverified',409);
   const tokenHash=await verifyBot(before.line_oa_id,process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN);
   const other=await client.query('SELECT 1 FROM oa_service_control WHERE id<>$1 AND enabled=true AND deleted_at IS NULL LIMIT 1',[before.id]);
   if(other.rowCount)throw new OwnerError('multi_oa_not_supported',409);
   row=(await client.query<Row>('UPDATE oa_service_control SET paused=false,verified_token_hash=$2,updated_at=now() WHERE id=$1 RETURNING *',[before.id,tokenHash])).rows[0];
  }else if(action==='remove'){
   if(before.enabled)throw new OwnerError('disable_before_remove',409);
   row=(await client.query<Row>('UPDATE oa_service_control SET deleted_at=now(),paused=false,verified_token_hash=NULL,updated_at=now() WHERE id=$1 RETURNING *',[before.id])).rows[0];
  }
  else if(action==='setExpiry')row=(await client.query<Row>('UPDATE oa_service_control SET expires_at=$2,updated_at=now() WHERE id=$1 RETURNING *',[before.id,expiry(input.expiresAt)])).rows[0];
  else row=(await client.query<Row>(`UPDATE oa_service_control SET expires_at=greatest(expires_at,now())+interval '30 days',updated_at=now() WHERE id=$1 RETURNING *`,[before.id])).rows[0];
 }
 await client.query('INSERT INTO oa_service_audit(oa_id,actor_channel_id,actor_user_id,action,before_state,after_state,request_key) VALUES($1,$2,$3,$4,$5,$6,$7)',[row.id,actor.channelId,actor.userId,verb,before?JSON.stringify(publicRow(before,new Date())):null,JSON.stringify(publicRow(row,new Date())),key]);await client.query('COMMIT');return publicRow(row,new Date());
 }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
