import type {Pool,PoolClient} from 'pg';
import type {ApplyResult,HistoryFilter,LedgerEntry,Mutation,Wallet,WalletStore} from '../types';

type WalletRow={id:string;member_id:string;available_points:string|number;reserved_points:string|number;status:Wallet['status'];created_at:Date;updated_at:Date};
type LedgerRow={id:string;member_id:string;wallet_id:string;type:LedgerEntry['type'];points:string|number;balance_before:string|number;balance_after:string|number;reference_id:string;idempotency_key:string;created_at:Date;audit_actor:string;audit_source:string};
function safe(value:string|number):number {const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw new Error('STORE_ERROR');return n}
function signed(value:string|number):number {const n=Number(value);if(!Number.isSafeInteger(n)||n===0)throw new Error('STORE_ERROR');return n}
function wallet(row:WalletRow):Wallet{return {id:row.id,memberId:row.member_id,availablePoints:safe(row.available_points),reservedPoints:safe(row.reserved_points),status:row.status,createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString()}}
function ledger(row:LedgerRow):LedgerEntry{return {id:row.id,memberId:row.member_id,walletId:row.wallet_id,type:row.type,points:row.type==='DEMO_ADJUSTMENT'?signed(row.points):safe(row.points),balanceBefore:safe(row.balance_before),balanceAfter:safe(row.balance_after),referenceId:row.reference_id,idempotencyKey:row.idempotency_key,createdAt:new Date(row.created_at).toISOString(),audit:{actor:row.audit_actor,source:row.audit_source}}}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function member(memberId:string){if(!uuid.test(memberId))throw new Error('INVALID_INPUT')}
async function transaction<T>(pool:Pick<Pool,'connect'>,memberId:string,fn:(client:PoolClient)=>Promise<T>):Promise<T>{
 member(memberId);const client=await pool.connect();
 try{await client.query('BEGIN');await client.query("SELECT set_config('pair_live.member_id',$1,true)",[memberId]);const result=await fn(client);await client.query('COMMIT');return result}
 catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
async function insertZero(client:PoolClient,memberId:string):Promise<Wallet>{
 const created=await client.query<WalletRow>('INSERT INTO member_wallets(member_id) VALUES($1) ON CONFLICT(member_id) DO NOTHING RETURNING *',[memberId]);
 if(created.rows[0])await client.query('INSERT INTO member_wallet_audit_logs(wallet_id,member_id,action,actor,source) VALUES($1,$2,$3,$4,$5)',[created.rows[0].id,memberId,'CREATED','system','internal']);
 const found=await client.query<WalletRow>('SELECT * FROM member_wallets WHERE member_id=$1 FOR UPDATE',[memberId]);
 if(!found.rows[0])throw new Error('STORE_ERROR');return wallet(found.rows[0]);
}

/** Private server adapter; never call this with a browser-supplied member ID. */
export function createPostgresWalletStore(pool:Pick<Pool,'connect'>):WalletStore{
 if(!pool?.connect)throw new Error('STORE_ERROR');
 return {
  ensure(memberId){return transaction(pool,memberId,client=>insertZero(client,memberId))},
  read(memberId){return transaction(pool,memberId,async client=>{const r=await client.query<WalletRow>('SELECT * FROM member_wallets WHERE member_id=$1',[memberId]);return r.rows[0]?wallet(r.rows[0]):null})},
  history(memberId,filter:HistoryFilter){return transaction(pool,memberId,async client=>{
   const limit=filter.limit??100;if(!Number.isInteger(limit)||limit<1||limit>500)throw new Error('INVALID_INPUT');
   const r=await client.query<LedgerRow>('SELECT * FROM member_wallet_ledger WHERE member_id=$1 AND ($2::timestamptz IS NULL OR created_at>=$2) AND ($3::timestamptz IS NULL OR created_at<$3) ORDER BY created_at DESC,id DESC LIMIT $4',[memberId,filter.from??null,filter.to??null,limit]);return r.rows.map(ledger);
  })},
  applyAtomic(input:Mutation):Promise<ApplyResult>{return transaction(pool,input.memberId,async client=>{
   if(!Number.isSafeInteger(input.points)||(input.type==='DEMO_ADJUSTMENT'?input.points===0:input.points<=0)||!input.referenceId||!input.idempotencyKey||!input.actor||!['DEMO_GRANT','DEMO_USE','DEMO_REFUND','DEMO_ADJUSTMENT'].includes(input.type)||!['admin','round','internal'].includes(input.source))throw new Error('INVALID_INPUT');
   // Database gate is independent of the host's migrationComplete flag. The
   // migration defaults disabled while Core still debits members.demo_points.
   const state=await client.query<{enabled:boolean}>('SELECT enabled FROM member_wallet_runtime_state WHERE id=1 FOR SHARE');
   if(state.rows[0]?.enabled!==true)throw new Error('NOT_ACTIVATED');
   const current=await insertZero(client,input.memberId);
   const prior=await client.query<LedgerRow>('SELECT * FROM member_wallet_ledger WHERE member_id=$1 AND idempotency_key=$2',[input.memberId,input.idempotencyKey]);
   if(prior.rows[0]){
    const old=ledger(prior.rows[0]);
    if(old.type!==input.type||old.points!==input.points||old.referenceId!==input.referenceId||old.audit.source!==input.source)throw new Error('IDEMPOTENCY_CONFLICT');
    return {wallet:current,entry:old,replayed:true};
   }
   if(current.status!=='ACTIVE')throw new Error('FROZEN');
   const after=input.type==='DEMO_USE'?current.availablePoints-input.points:current.availablePoints+input.points;
   if(after<0)throw new Error('INSUFFICIENT_POINTS');if(!Number.isSafeInteger(after))throw new Error('INVALID_INPUT');
   const updated=await client.query<WalletRow>('UPDATE member_wallets SET available_points=$1,updated_at=clock_timestamp() WHERE id=$2 AND member_id=$3 RETURNING *',[after,current.id,input.memberId]);
   const inserted=await client.query<LedgerRow>('INSERT INTO member_wallet_ledger(member_id,wallet_id,type,points,balance_before,balance_after,reference_id,idempotency_key,audit_actor,audit_source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[input.memberId,current.id,input.type,input.points,current.availablePoints,after,input.referenceId,input.idempotencyKey,input.actor,input.source]);
   await client.query('INSERT INTO member_wallet_audit_logs(wallet_id,member_id,ledger_id,action,actor,source) VALUES($1,$2,$3,$4,$5,$6)',[current.id,input.memberId,inserted.rows[0].id,'MUTATION',input.actor,input.source]);
   return {wallet:wallet(updated.rows[0]),entry:ledger(inserted.rows[0]),replayed:false};
  })},
 };
}
