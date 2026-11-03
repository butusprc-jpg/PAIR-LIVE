import type {ApplyResult,HistoryFilter,LedgerEntry,Result,Wallet,WalletConfig,WalletError} from '../types';
import {validAdjustmentPoints,validKey,validMemberId,validPoints,validReference} from './validation';
const fail=<T>(error:WalletError):Result<T>=>({ok:false,error});
const ok=<T>(value:T):Result<T>=>({ok:true,value});
const storeError=(error:unknown):WalletError=>{
 const code=(error as {code?:string;message?:string})?.code??(error as {message?:string})?.message;
 return code==='NOT_ACTIVATED'||code==='FROZEN'||code==='INSUFFICIENT_POINTS'||code==='IDEMPOTENCY_CONFLICT'||code==='INVALID_INPUT'?code:'STORE_ERROR';
};
function assertServer(){if(typeof window!=='undefined'||!process.versions?.node)throw new Error('wallet_server_runtime_required')}

/** Opt-in wallet. Core keeps using members.demo_points until an explicit, reconciled cutover. */
export function createMemberWalletModule<Context>(config:WalletConfig<Context>){
 assertServer();
 if(!config?.store?.ensure||!config.store.read||!config.store.history||!config.store.applyAtomic||!config.members?.memberId||!config.admins?.requireAdmin||typeof config.production!=='boolean'||typeof config.migrationComplete!=='boolean')throw new Error('wallet_not_configured');
 const enabled=()=>config.migrationComplete;
 async function owner(context:Context,memberId:string):Promise<Result<string>>{
  assertServer();if(!validMemberId(memberId))return fail('INVALID_INPUT');
  try{const actor=await config.members.memberId(context);return actor===memberId?ok(memberId):fail(actor?'FORBIDDEN':'UNAUTHORIZED')}catch{return fail('UNAUTHORIZED')}
 }
 async function ensureWallet(context:Context,memberId:string):Promise<Result<Wallet>>{
  if(!enabled())return fail('NOT_ACTIVATED');const access=await owner(context,memberId);if(!access.ok)return access;
  try{return ok(await config.store.ensure(memberId))}catch(error){return fail(storeError(error))}
 }
 async function getWallet(context:Context,memberId:string):Promise<Result<Wallet>>{
  if(!enabled())return fail('NOT_ACTIVATED');const access=await owner(context,memberId);if(!access.ok)return access;
  try{const wallet=await config.store.read(memberId);return wallet?ok(wallet):fail('NOT_FOUND')}catch(error){return fail(storeError(error))}
 }
 async function getWalletHistory(context:Context,memberId:string,filter:HistoryFilter={}):Promise<Result<LedgerEntry[]>>{
  if(!enabled())return fail('NOT_ACTIVATED');const access=await owner(context,memberId);if(!access.ok)return access;
  if(filter.limit!==undefined&&(!Number.isInteger(filter.limit)||filter.limit<1||filter.limit>200))return fail('INVALID_INPUT');
  if(filter.from&&Number.isNaN(Date.parse(filter.from))||filter.to&&Number.isNaN(Date.parse(filter.to))||filter.from&&filter.to&&Date.parse(filter.from)>Date.parse(filter.to))return fail('INVALID_INPUT');
  try{return ok(await config.store.history(memberId,filter))}catch(error){return fail(storeError(error))}
 }
 async function grantDemoPoints(context:Context,memberId:string,points:number,referenceId:string,idempotencyKey:string):Promise<Result<ApplyResult>>{
  return adminMutation(context,memberId,points,referenceId,idempotencyKey,'DEMO_GRANT');
 }
 async function refundDemoPoints(context:Context,memberId:string,points:number,referenceId:string,idempotencyKey:string):Promise<Result<ApplyResult>>{
  return adminMutation(context,memberId,points,referenceId,idempotencyKey,'DEMO_REFUND');
 }
 async function adjustDemoPoints(context:Context,memberId:string,points:number,referenceId:string,idempotencyKey:string):Promise<Result<ApplyResult>>{
  return adminMutation(context,memberId,points,referenceId,idempotencyKey,'DEMO_ADJUSTMENT');
 }
 async function adminMutation(context:Context,memberId:string,points:number,referenceId:string,idempotencyKey:string,type:'DEMO_GRANT'|'DEMO_REFUND'|'DEMO_ADJUSTMENT'):Promise<Result<ApplyResult>>{
  assertServer();if(!enabled())return fail('NOT_ACTIVATED');
  if(!validMemberId(memberId)||!(type==='DEMO_ADJUSTMENT'?validAdjustmentPoints(points):validPoints(points))||!validReference(referenceId)||!validKey(idempotencyKey))return fail('INVALID_INPUT');
  let actor:string,source:'admin'|'internal';
  try{const admin=await config.admins.requireAdmin(context);if(admin?.id){actor=admin.id;source='admin'}else if(config.internalHarness&&!config.production&&process.env.NODE_ENV!=='production'){actor='internal-test-harness';source='internal'}else return fail('FORBIDDEN')}
  catch{return fail('FORBIDDEN')}
  try{return ok(await config.store.applyAtomic({memberId,type,points,referenceId,idempotencyKey,actor,source}))}
  catch(error){return fail(storeError(error))}
 }
 async function useDemoPoints(context:Context,memberId:string,points:number,referenceId:string,idempotencyKey:string):Promise<Result<ApplyResult>>{
  assertServer();if(!enabled()||!config.roundUse)return fail('NOT_ACTIVATED');
  const access=await owner(context,memberId);if(!access.ok)return access;
  if(!validPoints(points)||!validReference(referenceId)||!validKey(idempotencyKey))return fail('INVALID_INPUT');
  try{return ok(await config.roundUse.commit(context,memberId,points,referenceId,idempotencyKey))}
  catch(error){return fail(storeError(error))}
 }
 return {ensureWallet,getWallet,getWalletHistory,getWalletLedger:getWalletHistory,grantDemoPoints,useDemoPoints,refundDemoPoints,adjustDemoPoints};
}
