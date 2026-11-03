import type {LedgerEntry,Mutation,Wallet} from '../types';
/** Validate the invariant on data returned by an injected persistence adapter. */
export function validTransition(before:Wallet,after:Wallet,entry:LedgerEntry,operation:Mutation):boolean {
 const delta=operation.type==='DEMO_USE'?-operation.points:operation.points;
 return before.id===after.id&&before.memberId===after.memberId&&after.memberId===operation.memberId&&
  Number.isSafeInteger(after.availablePoints)&&after.availablePoints>=0&&Number.isSafeInteger(after.reservedPoints)&&after.reservedPoints>=0&&
  after.availablePoints===before.availablePoints+delta&&entry.balanceBefore===before.availablePoints&&entry.balanceAfter===after.availablePoints&&
  entry.memberId===operation.memberId&&entry.walletId===before.id&&entry.idempotencyKey===operation.idempotencyKey;
}
