import type {Pool,PoolClient} from 'pg';
import {walletPathFromDatabase} from '../server/wallet-cutover';
import {applyWalletMutationWithClient} from '../../modules/member-wallet/server/postgres';
import {TopupError,uuid,validatePoints} from '../topup/store';

export type WithdrawalAction='TRANSFERRED'|'REJECTED';
async function scoped<T>(pool:Pool,member:string|null,fn:(c:PoolClient)=>Promise<T>):Promise<T>{
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  await c.query("SELECT set_config('pair_live.member_id',$1,true),set_config('pair_live.topup_admin',$2,true)",[member||'',member?'false':'true']);
  const result=await fn(c);await c.query('COMMIT');return result;
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
export function validateDetails(value:unknown):string{
 if(typeof value!=='string')throw new TopupError('withdrawal_details_required');
 const details=value.trim();
 if(!details||Array.from(details).length>50||details.length>50||/[\u0000-\u001f\u007f]/.test(details))throw new TopupError('withdrawal_details_invalid');
 return details;
}
export async function listWithdrawals(pool:Pool,memberId:string){
 return scoped(pool,memberId,async c=>(await c.query(
  'SELECT id,requested_points,payout_details,status,debit_timing,created_at FROM member_withdrawal_requests WHERE member_id=$1 ORDER BY created_at DESC LIMIT 30',[memberId])).rows);
}
export async function createWithdrawal(pool:Pool,memberId:string,points:unknown,detailsValue:unknown,key:unknown,recipients:string[]){
 const count=validatePoints(points);const details=validateDetails(detailsValue);
 if(!uuid(key))throw new TopupError('invalid_idempotency_key');
 if(!recipients.length)throw new TopupError('withdrawal_admin_unavailable',503);
 for(const id of recipients)if(!/^U[0-9a-f]{32}$/i.test(id))throw new TopupError('invalid_line_recipient');
 return scoped(pool,memberId,async c=>{
  const member=await c.query('SELECT status,demo_points FROM members WHERE id=$1 FOR UPDATE',[memberId]);
  if(member.rows[0]?.status!=='active')throw new TopupError('member_suspended',403);
  const prior=await c.query('SELECT * FROM member_withdrawal_requests WHERE member_id=$1 AND idempotency_key=$2',[memberId,key]);
  if(prior.rows[0]){
   if(prior.rows[0].requested_points!==count||prior.rows[0].payout_details!==details)throw new TopupError('idempotency_conflict',409);
   return {...prior.rows[0],replayed:true};
  }
  const path=await walletPathFromDatabase(c);
  const available=path==='wallet'?Number((await c.query('SELECT available_points FROM member_wallets WHERE member_id=$1',[memberId])).rows[0]?.available_points??0):Number(member.rows[0].demo_points);
  if(available<count)throw new TopupError('withdrawal_insufficient_points',409);
  const row=(await c.query("INSERT INTO member_withdrawal_requests(member_id,requested_points,payout_details,idempotency_key,debit_timing) VALUES($1,$2,$3,$4,'ON_APPROVAL') RETURNING *",[memberId,count,details,key])).rows[0];
  await c.query("SELECT set_config('pair_live.topup_admin','true',true)");
  for(const id of new Set(recipients))await c.query("INSERT INTO member_withdrawal_line_outbox(request_id,recipient_user_id,purpose) VALUES($1,$2,'ADMIN_REQUEST') ON CONFLICT DO NOTHING",[row.id,id]);
  return {...row,replayed:false};
 });
}
export async function decideWithdrawal(pool:Pool,adminId:string,requestId:unknown,action:unknown){
 if(!uuid(requestId)||!['TRANSFERRED','REJECTED'].includes(String(action)))throw new TopupError('invalid_withdrawal_decision');
 return scoped(pool,null,c=>decideWithdrawalWithClient(c,adminId,requestId,action));
}
export async function decideWithdrawalWithClient(c:PoolClient,adminId:string,requestId:unknown,action:unknown){
 if(!uuid(requestId)||!['TRANSFERRED','REJECTED'].includes(String(action)))throw new TopupError('invalid_withdrawal_decision');
  const admin=await c.query("SELECT id FROM admin_identities WHERE id=$1 AND status='active' FOR SHARE",[adminId]);
  if(!admin.rowCount)throw new TopupError('admin_forbidden',403);
  const r=(await c.query('SELECT * FROM member_withdrawal_requests WHERE id=$1 FOR UPDATE',[requestId])).rows[0];
  if(!r)throw new TopupError('withdrawal_not_found',404);
  if(r.status!=='PENDING')return {...r,replayed:true};
  const path=await walletPathFromDatabase(c);
  if(path==='wallet')await c.query("SELECT set_config('pair_live.member_id',$1,true)",[r.member_id]);
  if(action==='TRANSFERRED'&&r.debit_timing==='ON_APPROVAL'){
   const m=(await c.query('SELECT demo_points FROM members WHERE id=$1 FOR UPDATE',[r.member_id])).rows[0];
   if(!m)throw new TopupError('withdrawal_insufficient_points',409);
   if(path==='wallet'){
    try{await applyWalletMutationWithClient(c,{memberId:r.member_id,type:'DEMO_USE',points:r.requested_points,referenceId:r.id,idempotencyKey:`withdrawal:${r.id}:debit`,actor:adminId,source:'admin'})}
    catch(error){if(error instanceof Error&&error.message==='INSUFFICIENT_POINTS')throw new TopupError('withdrawal_insufficient_points',409);throw error}
   }else{
    if(m.demo_points<r.requested_points)throw new TopupError('withdrawal_insufficient_points',409);
    await c.query('UPDATE members SET demo_points=demo_points-$1,updated_at=now() WHERE id=$2',[r.requested_points,r.member_id]);
   }
  }
  if(action==='REJECTED'&&r.debit_timing==='PREDEBIT'){
   const m=(await c.query('SELECT demo_points FROM members WHERE id=$1 FOR UPDATE',[r.member_id])).rows[0];
   if(!m)throw new TopupError('member_suspended',403);
   if(path==='wallet')await applyWalletMutationWithClient(c,{memberId:r.member_id,type:'DEMO_REFUND',points:r.requested_points,referenceId:r.id,idempotencyKey:`withdrawal:${r.id}:predebit-refund`,actor:adminId,source:'admin'});
   else{
    if(m.demo_points+r.requested_points>2147483647)throw new TopupError('balance_overflow',409);
    await c.query('UPDATE members SET demo_points=demo_points+$1,updated_at=now() WHERE id=$2',[r.requested_points,r.member_id]);
   }
  }
  await c.query('INSERT INTO member_withdrawal_audit(request_id,member_id,admin_id,action,points) VALUES($1,$2,$3,$4,$5)',[r.id,r.member_id,adminId,action,r.requested_points]);
  const result=(await c.query('UPDATE member_withdrawal_requests SET status=$1,decided_by=$2,decided_at=now() WHERE id=$3 RETURNING *',[action,adminId,r.id])).rows[0];
  const channel=process.env.LINE_LOGIN_CHANNEL_ID;
  const user=channel?(await c.query(
   "SELECT provider_user_id FROM member_identities WHERE member_id=$1 AND provider='line' AND provider_channel_id=$2 ORDER BY last_login_at DESC LIMIT 1",
   [r.member_id,channel])).rows[0]?.provider_user_id:null;
  if(user&&/^U[0-9a-f]{32}$/i.test(user))
   await c.query("INSERT INTO member_withdrawal_line_outbox(request_id,recipient_user_id,purpose) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[r.id,user,action==='TRANSFERRED'?'MEMBER_TRANSFERRED':'MEMBER_REJECTED']);
  return {...result,replayed:false};
}
