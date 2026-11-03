import test from 'node:test';
import assert from 'node:assert/strict';
import type {Pool} from 'pg';
import {createPostgresWalletStore} from '../server/postgres';
import type {Mutation} from '../types';

const memberId='11111111-1111-4111-8111-111111111111';
const instant=new Date('2026-11-03T00:00:00Z');
const row={id:'22222222-2222-4222-8222-222222222222',member_id:memberId,available_points:'10',reserved_points:'0',status:'ACTIVE',created_at:instant,updated_at:instant};
const entry={id:'33333333-3333-4333-8333-333333333333',member_id:memberId,wallet_id:row.id,type:'DEMO_USE',points:'5',balance_before:'10',balance_after:'5',reference_id:'round:1',idempotency_key:'key-1',created_at:instant,audit_actor:'round',audit_source:'round'};
const mutation:Mutation={memberId,type:'DEMO_USE',points:5,referenceId:'round:1',idempotencyKey:'key-1',actor:'round',source:'round'};
function fake({enabled=true,prior=false}: {enabled?:boolean;prior?:boolean}={}){
 const queries:{sql:string;values:unknown[]}[]=[];
 const client={query:async(sql:string,values:unknown[]=[])=>{
  queries.push({sql,values});
  if(sql.includes('FROM member_wallet_runtime_state'))return {rows:[{enabled}]};
  if(sql.startsWith('INSERT INTO member_wallets'))return {rows:[]};
  if(sql.startsWith('SELECT * FROM member_wallets'))return {rows:[row]};
  if(sql.startsWith('SELECT * FROM member_wallet_ledger'))return {rows:prior?[entry]:[]};
  if(sql.startsWith('UPDATE member_wallets'))return {rows:[{...row,available_points:'5'}]};
  if(sql.startsWith('INSERT INTO member_wallet_ledger'))return {rows:[entry]};
  return {rows:[]};
 },release:()=>{}};
 const pool={connect:async()=>client} as unknown as Pick<Pool,'connect'>;
 return {pool,queries};
}
test('inactive database cutover refuses mutation before any wallet balance or ledger write',async()=>{
 const f=fake({enabled:false});await assert.rejects(createPostgresWalletStore(f.pool).applyAtomic(mutation),/NOT_ACTIVATED/);
 assert.ok(f.queries.some(q=>q.sql.includes('member_wallet_runtime_state')));
 assert.ok(!f.queries.some(q=>q.sql.startsWith('UPDATE member_wallets')||q.sql.startsWith('INSERT INTO member_wallet_ledger')));
 assert.ok(f.queries.some(q=>q.sql==='ROLLBACK'));
});
test('scoped transaction locks wallet and commits one debit plus append-only ledger and audit',async()=>{
 const f=fake();const result=await createPostgresWalletStore(f.pool).applyAtomic(mutation);
 assert.equal(result.wallet.availablePoints,5);assert.equal(result.entry.balanceBefore,10);assert.equal(result.entry.balanceAfter,5);
 assert.ok(f.queries.some(q=>q.sql.includes("set_config('pair_live.member_id'")));assert.ok(f.queries.some(q=>q.sql.includes('FOR UPDATE')));
 assert.ok(f.queries.some(q=>q.sql.startsWith('INSERT INTO member_wallet_ledger')));assert.ok(f.queries.some(q=>q.sql.startsWith('INSERT INTO member_wallet_audit_logs')));
 assert.equal(f.queries.at(-1)?.sql,'COMMIT');
});
test('idempotent replay returns existing entry without a second debit',async()=>{
 const f=fake({prior:true});const result=await createPostgresWalletStore(f.pool).applyAtomic(mutation);
 assert.equal(result.replayed,true);assert.ok(!f.queries.some(q=>q.sql.startsWith('UPDATE member_wallets')));
});
test('same idempotency key with different points fails closed',async()=>{
 const f=fake({prior:true});await assert.rejects(createPostgresWalletStore(f.pool).applyAtomic({...mutation,points:4}),/IDEMPOTENCY_CONFLICT/);
 assert.ok(!f.queries.some(q=>q.sql.startsWith('UPDATE member_wallets')));
});
test('member reads and history set transaction-local owner identity',async()=>{
 const f=fake();const store=createPostgresWalletStore(f.pool);await store.read(memberId);await store.history(memberId,{limit:10});
 assert.equal(f.queries.filter(q=>q.sql.includes("set_config('pair_live.member_id'")).length,2);
 assert.ok(f.queries.some(q=>q.sql.startsWith('SELECT * FROM member_wallet_ledger')));
});
test('signed correction records a negative adjustment and refuses an overdraft',async()=>{
 const f=fake();await createPostgresWalletStore(f.pool).applyAtomic({...mutation,type:'DEMO_ADJUSTMENT',points:-4,source:'admin',actor:'admin-1'});
 const update=f.queries.find(q=>q.sql.startsWith('UPDATE member_wallets'));
 const entryWrite=f.queries.find(q=>q.sql.startsWith('INSERT INTO member_wallet_ledger'));
 assert.equal(update?.values[0],6);assert.equal(entryWrite?.values[3],-4);assert.equal(entryWrite?.values[5],6);
 const overdraft=fake();await assert.rejects(createPostgresWalletStore(overdraft.pool).applyAtomic({...mutation,type:'DEMO_ADJUSTMENT',points:-11,source:'admin',actor:'admin-1'}),/INSUFFICIENT_POINTS/);
 assert.ok(!overdraft.queries.some(q=>q.sql.startsWith('UPDATE member_wallets')));
});
