import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {assertTestTarget,migrationManifest} from '../lib/migration-manifest';
import {createWithdrawal,decideWithdrawal,listWithdrawals,validateDetails} from '../lib/withdrawal/store';
import {dispatchWithdrawalLine,withdrawalCard,processWithdrawalPostback} from '../lib/withdrawal/line';

test('withdrawal details must be provided and no longer than 50 characters',()=>{
 assert.equal(validateDetails(' 123-456 '),'123-456');
 for(const s of ['', ' ', 'x'.repeat(51), 'a\nb'])assert.throws(()=>validateDetails(s));
 const card=JSON.stringify(withdrawalCard({id:randomUUID(),display_name:'Member',requested_points:50,payout_details:'123456'}));
 assert.match(card,/withdraw:v1:transfer:/);
 assert.doesNotMatch(card,/admin\/topup-review/);
});
const raw=process.env.TOPUP_TEST_DATABASE_URL;
test('withdrawal reserves balance, blocks overdraft, refunds rejection, and confirms once',{skip:!raw},async()=>{
 const pool=new Pool({connectionString:assertTestTarget(raw),max:12});
 const schema='withdraw_test_'+randomUUID().replaceAll('-','');
 let db:Pool|undefined;
 try{
  await pool.query(`CREATE SCHEMA ${schema}`);
  const url=new URL(raw!);url.searchParams.set('options',`-csearch_path=${schema}`);
  db=new Pool({connectionString:url.toString(),max:12});
  for(const migration of await migrationManifest())await db.query(migration.sql);
  const member=(await db.query("INSERT INTO members(display_name,demo_points) VALUES('Withdraw fixture',100) RETURNING id")).rows[0].id;
  const adminLine='U'+'a'.repeat(32),memberLine='U'+'b'.repeat(32);
  const admin=(await db.query("INSERT INTO admin_identities(provider,provider_channel_id,provider_user_id,display_name,status) VALUES('line','test',$1,'Admin','active') RETURNING id",[adminLine])).rows[0].id;
  await db.query("INSERT INTO member_identities(member_id,provider,provider_channel_id,provider_user_id) VALUES($1,'line','test',$2)",[member,memberLine]);
  const oldLogin=process.env.LINE_LOGIN_CHANNEL_ID,oldToken=process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
  try{
   process.env.LINE_LOGIN_CHANNEL_ID='test';process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN='test-token';
   const key=randomUUID(),recipients=[adminLine];
   const row=await createWithdrawal(db,member,80,'เลขบัญชี 1234',key,recipients);
   assert.equal(row.status,'PENDING');
   assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[member])).rows[0].demo_points,20);
   const replay=await createWithdrawal(db,member,80,'เลขบัญชี 1234',key,recipients);
   assert.equal(replay.id,row.id);assert.equal(replay.replayed,true);
   await assert.rejects(createWithdrawal(db,member,30,'abc',randomUUID(),recipients),/withdrawal_insufficient_points/);
   await assert.rejects(createWithdrawal(db,member,80,'different',key,recipients),/idempotency_conflict/);
   const delivery:{to:string;text:string}[]=[];
   const fakeFetch:typeof fetch=async(_url,init)=>{const b=JSON.parse(String(init?.body));delivery.push({to:b.to,text:JSON.stringify(b.messages[0])});return new Response('',{status:200})};
   const sent=await dispatchWithdrawalLine(db,{fetch:fakeFetch});
   assert.equal(sent.sent,1);assert.ok(delivery[0].text.includes('เลขบัญชี 1234'));
   const allowlist=JSON.stringify([{userId:adminLine,role:'admin'}]);
   const approved=await processWithdrawalPostback(db,{webhookEventId:'synthetic-withdraw-transfer',userId:adminLine,data:`withdraw:v1:transfer:${row.id}`},{fetch:fakeFetch,allowlist});
   assert.equal(approved.result,'TRANSFERRED');
   assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[member])).rows[0].demo_points,20);
   assert.equal((await db.query('SELECT count(*)::int n FROM member_withdrawal_audit WHERE request_id=$1',[row.id])).rows[0].n,1);
   assert.equal(delivery.filter(x=>x.to===memberLine&&x.text.includes('จ่ายแต้มแล้ว')).length,1);
   assert.equal((await processWithdrawalPostback(db,{webhookEventId:'synthetic-withdraw-replay',userId:adminLine,data:`withdraw:v1:transfer:${row.id}`},{fetch:fakeFetch,allowlist})).replayed,true);
   assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[member])).rows[0].demo_points,20);
   assert.equal(delivery.filter(x=>x.to===memberLine&&x.text.includes('จ่ายแต้มแล้ว')).length,1);
   const reject=await createWithdrawal(db,member,10,'account 22',randomUUID(),recipients);
   assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[member])).rows[0].demo_points,10);
   const rejected=await decideWithdrawal(db,admin,reject.id,'REJECTED');assert.equal(rejected.status,'REJECTED');
   assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[member])).rows[0].demo_points,20);
   assert.equal((await decideWithdrawal(db,admin,reject.id,'REJECTED')).replayed,true);
   assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[member])).rows[0].demo_points,20);
   assert.equal((await listWithdrawals(db,member)).length,2);
  }finally{
   if(oldLogin===undefined)delete process.env.LINE_LOGIN_CHANNEL_ID;else process.env.LINE_LOGIN_CHANNEL_ID=oldLogin;
   if(oldToken===undefined)delete process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;else process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=oldToken;
  }
 }finally{await db?.end();await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end()}
});
