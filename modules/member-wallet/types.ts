export type WalletStatus='ACTIVE'|'FROZEN';
export type LedgerType='DEMO_GRANT'|'DEMO_USE'|'DEMO_REFUND'|'DEMO_ADJUSTMENT';
export type WalletError='UNAUTHORIZED'|'FORBIDDEN'|'NOT_FOUND'|'FROZEN'|'INSUFFICIENT_POINTS'|'INVALID_INPUT'|'IDEMPOTENCY_CONFLICT'|'NOT_ACTIVATED'|'STORE_ERROR';
export type Result<T>={ok:true;value:T}|{ok:false;error:WalletError};
export interface Wallet {id:string;memberId:string;availablePoints:number;reservedPoints:number;status:WalletStatus;createdAt:string;updatedAt:string}
export interface LedgerEntry {id:string;memberId:string;walletId:string;type:LedgerType;points:number;balanceBefore:number;balanceAfter:number;referenceId:string;idempotencyKey:string;createdAt:string;audit:{actor:string;source:string}}
export interface HistoryFilter {from?:string;to?:string;limit?:number}
export interface Mutation {memberId:string;type:LedgerType;points:number;referenceId:string;idempotencyKey:string;actor:string;source:'admin'|'round'|'internal'}
export interface ApplyResult {wallet:Wallet;entry:LedgerEntry;replayed:boolean}
/** Implement applyAtomic in one database transaction with a wallet row lock and unique idempotency key. */
export interface WalletStore {ensure(memberId:string):Promise<Wallet>;read(memberId:string):Promise<Wallet|null>;history(memberId:string,filter:HistoryFilter):Promise<LedgerEntry[]>;applyAtomic(mutation:Mutation):Promise<ApplyResult>}
/** Host uses its verified member session, never a browser supplied member ID. */
export interface MemberIdentityAdapter<Context> {memberId(context:Context):Promise<string|null>}
/** Host uses verified Admin Auth; no browser-supplied role is trusted. */
export interface AdminAuthorizationAdapter<Context> {requireAdmin(context:Context):Promise<{id:string}|null>}
/** Core controls the round state and inserts its entry in the same DB transaction during future integration. */
export interface RoundUseAdapter<Context> {commit(context:Context,memberId:string,points:number,referenceId:string,idempotencyKey:string):Promise<ApplyResult>}
export interface WalletConfig<Context> {store:WalletStore;members:MemberIdentityAdapter<Context>;admins:AdminAuthorizationAdapter<Context>;roundUse?:RoundUseAdapter<Context>;migrationComplete:false|true;production:boolean;internalHarness?:boolean}
