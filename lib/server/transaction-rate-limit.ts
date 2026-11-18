import type {Pool} from 'pg';

export type TransactionLimitScope='round_entry'|'member_topup'|'member_withdrawal'|'admin_topup_decision';
type QueryStore=Pick<Pool,'query'>;

export function transactionLimit(scope:TransactionLimitScope){
 const admin=scope==='admin_topup_decision';
 const raw=process.env[admin?'ADMIN_TRANSACTION_RATE_LIMIT_PER_MINUTE':'MEMBER_TRANSACTION_RATE_LIMIT_PER_MINUTE'];
 if(raw===undefined)return admin?20:10;
 const value=Number(raw);
 if(!Number.isSafeInteger(value)||value<1||value>1000)throw new Error('transaction_rate_limit_configuration_invalid');
 return value;
}

/** A single UPSERT serializes concurrent requests across web instances. */
export async function takeTransactionSlot(db:QueryStore,scope:TransactionLimitScope,actorId:string,limit=transactionLimit(scope)){
 if(!Number.isSafeInteger(limit)||limit<1||limit>1000)throw new Error('transaction_rate_limit_configuration_invalid');
 const result=await db.query<{window_start:Date}>(`
  INSERT INTO transaction_rate_limits(scope,actor_id,window_start,request_count)
  VALUES($1,$2,statement_timestamp(),1)
  ON CONFLICT(scope,actor_id) DO UPDATE SET
   request_count=CASE WHEN transaction_rate_limits.window_start<=statement_timestamp()-interval '1 minute' THEN 1 ELSE transaction_rate_limits.request_count+1 END,
   window_start=CASE WHEN transaction_rate_limits.window_start<=statement_timestamp()-interval '1 minute' THEN statement_timestamp() ELSE transaction_rate_limits.window_start END
  WHERE transaction_rate_limits.window_start<=statement_timestamp()-interval '1 minute' OR transaction_rate_limits.request_count<$3
  RETURNING window_start`,[scope,actorId,limit]);
 if(result.rowCount)return {allowed:true as const,retryAfter:0};
 const remaining=await db.query<{seconds:number}>('SELECT greatest(1,ceil(extract(epoch FROM window_start+interval \'1 minute\'-statement_timestamp())))::int AS seconds FROM transaction_rate_limits WHERE scope=$1 AND actor_id=$2',[scope,actorId]);
 return {allowed:false as const,retryAfter:Math.max(1,Number(remaining.rows[0]?.seconds||1))};
}

export function rateLimitResponse(retryAfter:number){return Response.json({error:'rate_limited'},{status:429,headers:{'Retry-After':String(retryAfter),'Cache-Control':'no-store'}})}
