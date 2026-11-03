import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMemberWalletModule} from '../index';
import type {ApplyResult,LedgerEntry,Mutation,Wallet,WalletStore} from '../types';
const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
type C={member:string|null;admin:boolean};
function fake(){
 const wallets=new Map<string,Wallet>(),ledger=new Map<string,LedgerEntry>(),keys=new Map<string,ApplyResult>();
 let queue=Promise.resolve();
 const store:WalletStore={
  async ensure(id){let w=wallets.get(id);if(!w){w={id:randomUUID(),memberId:id,availablePoints:0,reservedPoints:0,status:'ACTIVE',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};wallets.set(id,w)}return {...w}},
  async read(id){return wallets.get(id)??null},
  async history(id){return [...ledger.values()].filter(e=>e.memberId===id)},
  applyAtomic(mutation){const work=queue.then(async()=>{
   const key=mutation.memberId+':'+mutation.idempotencyKey,old=keys.get(key);
   if(old){if(old.entry.type!==mutation.type||old.entry.points!==mutation.points||old.entry.referenceId!==mutation.referenceId)throw Error('IDEMPOTENCY_CONFLICT');return {...old,replayed:true}}
   const before=await store.ensure(mutation.memberId);if(before.status!=='ACTIVE')throw Error('FROZEN');const delta=mutation.type==='DEMO_USE'?-mutation.points:mutation.points;
   if(before.availablePoints+delta<0)throw Error('INSUFFICIENT_POINTS');
   const wallet={...before,availablePoints:before.availablePoints+delta,updatedAt:new Date().toISOString()};wallets.set(mutation.memberId,wallet);
   const entry:LedgerEntry={id:randomUUID(),memberId:mutation.memberId,walletId:wallet.id,type:mutation.type,points:mutation.points,balanceBefore:before.availablePoints,balanceAfter:wallet.availablePoints,referenceId:mutation.referenceId,idempotencyKey:mutation.idempotencyKey,createdAt:new Date().toISOString(),audit:{actor:mutation.actor,source:mutation.source}};
   ledger.set(entry.id,entry);const result={wallet,entry,replayed:false};keys.set(key,result);return result;
  });queue=work.then(()=>{},()=>{});return work},
 };
 const member=(id:string):C=>({member:id,admin:false}),admin:C={member:a,admin:true};
 const create=(migrationComplete=true,roundUse?:{commit(context:C,id:string,points:number,ref:string,key:string):Promise<ApplyResult>})=>createMemberWalletModule<C>({store,members:{async memberId(c){return c.member}},admins:{async requireAdmin(c){return c.admin?{id:'admin'}:null}},migrationComplete,production:true,roundUse});
 return {store,wallets,ledger,create,member,admin};
}
test('new and returning member share one zero wallet by internal member ID',async()=>{const f=fake(),s=f.create();const one=await s.ensureWallet(f.member(a),a),two=await s.ensureWallet(f.member(a),a);assert.equal(one.ok&&two.ok&&one.value.id,two.ok&&two.value.id);assert.equal(f.wallets.size,1)});
test('member cannot read another wallet or ledger',async()=>{const f=fake(),s=f.create();await s.ensureWallet(f.member(b),b);assert.deepEqual(await s.getWallet(f.member(a),b),{ok:false,error:'FORBIDDEN'});assert.deepEqual(await s.getWalletLedger(f.member(a),b),{ok:false,error:'FORBIDDEN'})});
test('wallet writes fail before migration cutover and no standalone round debit exists',async()=>{const f=fake(),s=f.create(false);assert.deepEqual(await s.grantDemoPoints(f.admin,a,5,'x',randomUUID()),{ok:false,error:'NOT_ACTIVATED'});assert.deepEqual(await s.useDemoPoints(f.member(a),a,5,'x',randomUUID()),{ok:false,error:'NOT_ACTIVATED'});assert.equal(f.ledger.size,0)});
test('only admin can grant and refund; history is append-only in fake store',async()=>{const f=fake(),s=f.create();const k=randomUUID();assert.deepEqual(await s.grantDemoPoints(f.member(a),a,10,'grant',k),{ok:false,error:'FORBIDDEN'});const g=await s.grantDemoPoints(f.admin,a,10,'grant',k);assert.equal(g.ok&&g.value.wallet.availablePoints,10);const r=await s.refundDemoPoints(f.admin,a,3,'refund',randomUUID());assert.equal(r.ok&&r.value.wallet.availablePoints,13);const h=await s.getWalletLedger(f.member(a),a);assert.equal(h.ok&&h.value.length,2)});
test('idempotency returns original ledger and conflicting reuse fails',async()=>{const f=fake(),s=f.create(),k=randomUUID();const first=await s.grantDemoPoints(f.admin,a,8,'grant',k),again=await s.grantDemoPoints(f.admin,a,8,'grant',k);assert.equal(first.ok&&again.ok&&first.value.entry.id,again.ok&&again.value.entry.id);assert.equal(again.ok&&again.value.replayed,true);assert.deepEqual(await s.grantDemoPoints(f.admin,a,9,'other',k),{ok:false,error:'IDEMPOTENCY_CONFLICT'});assert.equal(f.ledger.size,1)});
test('round adapter receives verified member and concurrent uses cannot exceed balance',async()=>{const f=fake();const roundUse={commit:async(_c:C,id:string,points:number,ref:string,key:string)=>f.store.applyAtomic({memberId:id,type:'DEMO_USE',points,referenceId:ref,idempotencyKey:key,actor:id,source:'round'})};const s=f.create(true,roundUse);await s.grantDemoPoints(f.admin,a,10,'grant',randomUUID());const results=await Promise.all([s.useDemoPoints(f.member(a),a,7,'round1',randomUUID()),s.useDemoPoints(f.member(a),a,7,'round2',randomUUID())]);assert.equal(results.filter(x=>x.ok).length,1);assert.equal(results.filter(x=>!x.ok&&x.error==='INSUFFICIENT_POINTS').length,1);const w=await s.getWallet(f.member(a),a);assert.equal(w.ok&&w.value.availablePoints,3)});
test('signed adjustment records a correction and refuses a negative final balance',async()=>{const f=fake(),s=f.create();await s.grantDemoPoints(f.admin,a,10,'grant',randomUUID());const correction=await s.adjustDemoPoints(f.admin,a,-4,'correction',randomUUID());assert.equal(correction.ok&&correction.value.wallet.availablePoints,6);assert.deepEqual(await s.adjustDemoPoints(f.admin,a,-7,'too-large',randomUUID()),{ok:false,error:'INSUFFICIENT_POINTS'});assert.deepEqual(await s.adjustDemoPoints(f.admin,a,0,'zero',randomUUID()),{ok:false,error:'INVALID_INPUT'});assert.equal(f.ledger.size,2)});
