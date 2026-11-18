import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {assertTestTarget} from '../lib/migration-manifest';
import {rateLimitResponse,takeTransactionSlot,transactionLimit} from '../lib/server/transaction-rate-limit';

test('transaction limits default to 10 member and 20 admin requests and return Retry-After',()=>{
 const member=process.env.MEMBER_TRANSACTION_RATE_LIMIT_PER_MINUTE,admin=process.env.ADMIN_TRANSACTION_RATE_LIMIT_PER_MINUTE;
 try{
  delete process.env.MEMBER_TRANSACTION_RATE_LIMIT_PER_MINUTE;delete process.env.ADMIN_TRANSACTION_RATE_LIMIT_PER_MINUTE;
  assert.equal(transactionLimit('round_entry'),10);assert.equal(transactionLimit('member_topup'),10);
  assert.equal(transactionLimit('member_withdrawal'),10);assert.equal(transactionLimit('admin_topup_decision'),20);
  process.env.MEMBER_TRANSACTION_RATE_LIMIT_PER_MINUTE='4';assert.equal(transactionLimit('round_entry'),4);
  process.env.MEMBER_TRANSACTION_RATE_LIMIT_PER_MINUTE='0';assert.throws(()=>transactionLimit('round_entry'));
  const response=rateLimitResponse(17);assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'17');
 }finally{if(member===undefined)delete process.env.MEMBER_TRANSACTION_RATE_LIMIT_PER_MINUTE;else process.env.MEMBER_TRANSACTION_RATE_LIMIT_PER_MINUTE=member;if(admin===undefined)delete process.env.ADMIN_TRANSACTION_RATE_LIMIT_PER_MINUTE;else process.env.ADMIN_TRANSACTION_RATE_LIMIT_PER_MINUTE=admin}
});

const raw=process.env.RATE_LIMIT_TEST_DATABASE_URL;
test('PostgreSQL counter is atomic across pools, isolated by actor and scope, and resets after a minute',{skip:!raw},async()=>{
 const root=new Pool({connectionString:assertTestTarget(raw),ssl:false});
 const schema='rate_test_'+randomUUID().replaceAll('-','');
 await root.query(`CREATE SCHEMA ${schema}`);
 const url=new URL(raw!);url.searchParams.set('options',`-csearch_path=${schema}`);
 const a=new Pool({connectionString:url.toString(),ssl:false,max:8}),b=new Pool({connectionString:url.toString(),ssl:false,max:8});
 try{
  await a.query(await readFile('migrations/053_transaction_rate_limits.sql','utf8'));
  const actor=randomUUID(),other=randomUUID();
  const requests=await Promise.all(Array.from({length:24},(_,index)=>takeTransactionSlot(index%2?a:b,'round_entry',actor,10)));
  assert.equal(requests.filter(result=>result.allowed).length,10);
  assert.equal(requests.filter(result=>!result.allowed).length,14);
  assert.ok(requests.every(result=>result.allowed||result.retryAfter>=1&&result.retryAfter<=60));
  assert.equal((await takeTransactionSlot(b,'member_topup',actor,10)).allowed,true);
  assert.equal((await takeTransactionSlot(b,'round_entry',other,10)).allowed,true);
  for(const scope of ['member_withdrawal','admin_topup_decision'] as const){
   const cap=scope==='admin_topup_decision'?20:10;
   const concurrent=await Promise.all(Array.from({length:cap+3},(_,index)=>takeTransactionSlot(index%2?a:b,scope,actor,cap)));
   assert.equal(concurrent.filter(result=>result.allowed).length,cap,scope);
   assert.equal(concurrent.filter(result=>!result.allowed).length,3,scope);
  }
  assert.equal((await a.query("SELECT request_count FROM transaction_rate_limits WHERE scope='round_entry' AND actor_id=$1",[actor])).rows[0].request_count,10);
  await a.query("UPDATE transaction_rate_limits SET window_start=statement_timestamp()-interval '61 seconds' WHERE scope='round_entry' AND actor_id=$1",[actor]);
  assert.equal((await takeTransactionSlot(b,'round_entry',actor,10)).allowed,true);
  assert.equal((await a.query("SELECT request_count FROM transaction_rate_limits WHERE scope='round_entry' AND actor_id=$1",[actor])).rows[0].request_count,1);
 }finally{await a.end();await b.end();await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end()}
});
