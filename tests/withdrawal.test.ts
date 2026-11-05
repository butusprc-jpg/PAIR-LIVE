import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {assertTestTarget,migrationManifest} from '../lib/migration-manifest';
import {createWithdrawal,decideWithdrawal,validateDetails} from '../lib/withdrawal/store';
import {dispatchWithdrawalLine,withdrawalCard,processWithdrawalPostback} from '../lib/withdrawal/line';
import {handleLineWebhook} from '../lib/line-webhook-core';

test('withdrawal details and one-action LINE card',()=>{
 assert.equal(validateDetails(' 123-456 '),'123-456');
 for(const s of ['', ' ', 'x'.repeat(51), 'a\nb'])assert.throws(()=>validateDetails(s));
 const card=JSON.stringify(withdrawalCard({id:randomUUID(),display_name:'Member',requested_points:50,payout_details:'123456'}));
 assert.match(card,/withdraw:v1:transfer:/);assert.doesNotMatch(card,/withdraw:v1:confirm:/);
});
const raw=process.env.TOPUP_TEST_DATABASE_URL;
test('PostgreSQL approval debit, old predebit, webhook replay, and notifications',{skip:!raw},async()=>{
 const pool=new Pool({connectionString:assertTestTarget(raw),max:12});
 const schema='withdraw_test_'+randomUUID().replaceAll('-','');let db:Pool|undefined;
 try{
  await pool.query(`CREATE SCHEMA ${schema}`);
  const url=new URL(raw!);url.searchParams.set('options',`-csearch_path=${schema}`);
  db=new Pool({connectionString:url.toString(),max:1,connectionTimeoutMillis:1000});
  const migrations=await migrationManifest();for(const m of migrations.slice(0,-1))await db.query(m.sql);
  const member=(await db.query("INSERT INTO members(display_name,demo_points) VALUES('Withdraw fixture',1000) RETURNING id")).rows[0].id;
  const adminLine='U'+'a'.repeat(32),memberLine='U'+'b'.repeat(32);
  const admin=(await db.query("INSERT INTO admin_identities(provider,provider_channel_id,provider_user_id,display_name,status) VALUES('line','test',$1,'Admin','active') RETURNING id",[adminLine])).rows[0].id;
  await db.query("INSERT INTO member_identities(member_id,provider,provider_channel_id,provider_user_id) VALUES($1,'line','test',$2)",[member,memberLine]);
  const old100=(await db.query("INSERT INTO member_withdrawal_requests(member_id,requested_points,payout_details,idempotency_key) VALUES($1,100,'old 100',$2) RETURNING id",[member,randomUUID()])).rows[0].id;
  const old300=(await db.query("INSERT INTO member_withdrawal_requests(member_id,requested_points,payout_details,idempotency_key) VALUES($1,300,'old 300',$2) RETURNING id",[member,randomUUID()])).rows[0].id;
  await db.query('UPDATE members SET demo_points=600 WHERE id=$1',[member]);
  await db.query(migrations.at(-1)!.sql);
  assert.deepEqual((await db.query('SELECT DISTINCT debit_timing FROM member_withdrawal_requests')).rows,[{debit_timing:'PREDEBIT'}]);
  const balance=async()=>Number((await db!.query('SELECT demo_points FROM members WHERE id=$1',[member])).rows[0].demo_points);
  const oldLogin=process.env.LINE_LOGIN_CHANNEL_ID,oldToken=process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
  try{
   process.env.LINE_LOGIN_CHANNEL_ID='test';process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN='test-token';
   const recipients=[adminLine],allowlist=JSON.stringify([{userId:adminLine,role:'admin'}]);
   const key=randomUUID(),row=await createWithdrawal(db,member,100,'account 123',key,recipients);
   assert.equal(row.status,'PENDING');assert.equal(row.debit_timing,'ON_APPROVAL');assert.equal(await balance(),600);
   assert.equal((await createWithdrawal(db,member,100,'account 123',key,recipients)).replayed,true);assert.equal(await balance(),600);
   await assert.rejects(createWithdrawal(db,member,101,'different',key,recipients),/idempotency_conflict/);
   const delivery:{to:string;message:unknown}[]=[];
   const fakeFetch:typeof fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));delivery.push({to:body.to,message:body.messages[0]});return new Response('',{status:200})};
   const temporaryFailure:typeof fetch=async()=>new Response('',{status:503});
   assert.equal((await dispatchWithdrawalLine(db,{fetch:temporaryFailure})).retry,1);
   assert.equal(delivery.length,0);
   await db.query("UPDATE member_withdrawal_line_outbox SET next_attempt_at=now()-interval '1 second' WHERE request_id=$1",[row.id]);
   assert.equal((await dispatchWithdrawalLine(db,{fetch:fakeFetch})).sent,1);
   assert.equal((await dispatchWithdrawalLine(db,{fetch:fakeFetch})).sent,0);
   const secret='synthetic-webhook-secret';
   async function webhook(eventId:string,id:string,action='transfer'){
    const body=JSON.stringify({events:[{type:'postback',webhookEventId:eventId,source:{type:'user',userId:adminLine},postback:{data:`withdraw:v1:${action}:${id}`}}]});
    const signature=createHmac('sha256',secret).update(body).digest('base64');
    return handleLineWebhook(new Request('https://example.test/api/line/webhook',{method:'POST',headers:{'Content-Type':'application/json','X-Line-Signature':signature},body}),secret,async event=>{
     await processWithdrawalPostback(db!,{webhookEventId:event.webhookEventId,userId:event.userId,data:event.data!},{allowlist,fetch:fakeFetch});
    });
   }
   assert.equal((await webhook('new-approved',row.id)).status,200);assert.equal(await balance(),500);
   assert.match(JSON.stringify(delivery.at(-1)?.message),/ยืนยันจ่ายแต้มแล้ว/);
   assert.equal((await webhook('new-approved',row.id)).status,200);
   assert.equal((await webhook('new-approved-other-event',row.id)).status,200);assert.equal(await balance(),500);
   assert.equal((await db.query('SELECT count(*)::int n FROM member_withdrawal_audit WHERE request_id=$1',[row.id])).rows[0].n,1);
   assert.equal(delivery.filter(x=>x.to===memberLine).length,1);
   const reject=await createWithdrawal(db,member,50,'account 22',randomUUID(),recipients);
   assert.equal(await balance(),500);
   assert.equal((await processWithdrawalPostback(db,{webhookEventId:'new-rejected',userId:adminLine,data:`withdraw:v1:reject:${reject.id}`},{allowlist,fetch:fakeFetch})).result,'REJECTED');assert.equal(await balance(),500);
   assert.match(JSON.stringify(delivery.at(-1)?.message),/ปฏิเสธคำขอถอน/);
   assert.equal((await decideWithdrawal(db,admin,reject.id,'REJECTED')).replayed,true);
   const tooLarge=await createWithdrawal(db,member,450,'account 33',randomUUID(),recipients);
   const other=await createWithdrawal(db,member,100,'account 44',randomUUID(),recipients);
   await decideWithdrawal(db,admin,other.id,'TRANSFERRED');assert.equal(await balance(),400);
   const blocked=await processWithdrawalPostback(db,{webhookEventId:'insufficient',userId:adminLine,data:`withdraw:v1:transfer:${tooLarge.id}`},{allowlist,fetch:fakeFetch});
   assert.equal(blocked.result,'BLOCKED_INSUFFICIENT');assert.equal(await balance(),400);
   assert.match(JSON.stringify(delivery.at(-1)?.message),/ยอดแต้มไม่พอ/);
   assert.equal((await db.query('SELECT status FROM member_withdrawal_requests WHERE id=$1',[tooLarge.id])).rows[0].status,'PENDING');
   assert.equal((await db.query('SELECT count(*)::int n FROM member_withdrawal_audit WHERE request_id=$1',[tooLarge.id])).rows[0].n,0);
   assert.equal((await processWithdrawalPostback(db,{webhookEventId:'old-approved',userId:adminLine,data:`withdraw:v1:transfer:${old100}`},{allowlist,fetch:fakeFetch})).result,'TRANSFERRED');assert.equal(await balance(),400);
   assert.equal((await decideWithdrawal(db,admin,old100,'TRANSFERRED')).replayed,true);assert.equal(await balance(),400);
   assert.equal((await processWithdrawalPostback(db,{webhookEventId:'old-rejected',userId:adminLine,data:`withdraw:v1:reject:${old300}`},{allowlist,fetch:fakeFetch})).result,'REJECTED');assert.equal(await balance(),700);
   assert.match(JSON.stringify(delivery.at(-1)?.message),/คืน 300 แต้มแล้ว/);
   assert.equal((await decideWithdrawal(db,admin,old300,'REJECTED')).replayed,true);assert.equal(await balance(),700);
   const rollback=await createWithdrawal(db,member,60,'rollback fixture',randomUUID(),recipients);
   await db.query("CREATE FUNCTION fail_withdrawal_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic_audit_failure'; END $$");
   await db.query('CREATE TRIGGER fail_withdrawal_audit BEFORE INSERT ON member_withdrawal_audit FOR EACH ROW EXECUTE FUNCTION fail_withdrawal_audit()');
   await assert.rejects(decideWithdrawal(db,admin,rollback.id,'TRANSFERRED'),/synthetic_audit_failure/);
   assert.equal(await balance(),700);
   assert.equal((await db.query('SELECT status FROM member_withdrawal_requests WHERE id=$1',[rollback.id])).rows[0].status,'PENDING');
   assert.equal((await db.query('SELECT count(*)::int n FROM member_withdrawal_audit WHERE request_id=$1',[rollback.id])).rows[0].n,0);
   await db.query('DROP TRIGGER fail_withdrawal_audit ON member_withdrawal_audit');
   await db.query("CREATE FUNCTION fail_withdrawal_postback() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic_postback_failure'; END $$");
   await db.query('CREATE TRIGGER fail_withdrawal_postback BEFORE INSERT ON member_withdrawal_postbacks FOR EACH ROW EXECUTE FUNCTION fail_withdrawal_postback()');
   await assert.rejects(processWithdrawalPostback(db,{webhookEventId:'atomic-failure',userId:adminLine,data:`withdraw:v1:transfer:${rollback.id}`},{allowlist,fetch:fakeFetch}),/synthetic_postback_failure/);
   assert.equal(await balance(),700);
   assert.equal((await db.query('SELECT status FROM member_withdrawal_requests WHERE id=$1',[rollback.id])).rows[0].status,'PENDING');
   assert.equal((await db.query('SELECT count(*)::int n FROM member_withdrawal_audit WHERE request_id=$1',[rollback.id])).rows[0].n,0);
   assert.equal((await db.query("SELECT count(*)::int n FROM line_webhook_events WHERE event_id='atomic-failure'")).rows[0].n,0);
   await db.query('DROP TRIGGER fail_withdrawal_postback ON member_withdrawal_postbacks');
   const recovered=await processWithdrawalPostback(db,{webhookEventId:'atomic-failure',userId:adminLine,data:`withdraw:v1:transfer:${rollback.id}`},{allowlist,fetch:fakeFetch});
   assert.equal(recovered.result,'TRANSFERRED');assert.equal(await balance(),640);
   assert.equal((await db.query("SELECT processing_status FROM line_webhook_events WHERE event_id='atomic-failure'")).rows[0].processing_status,'PROCESSED');
   assert.equal((await db.query('SELECT count(*)::int n FROM member_withdrawal_postbacks WHERE request_id=$1',[rollback.id])).rows[0].n,1);
   assert.match(JSON.stringify(delivery.at(-1)?.message),/ยืนยันจ่ายแต้มแล้ว/);
   const forbidden=await processWithdrawalPostback(db,{webhookEventId:'unauthorized',userId:'U'+'c'.repeat(32),data:`withdraw:v1:transfer:${rollback.id}`},{allowlist,fetch:fakeFetch});
   assert.equal(forbidden.result,'FORBIDDEN');assert.equal(await balance(),640);
  }finally{
   if(oldLogin===undefined)delete process.env.LINE_LOGIN_CHANNEL_ID;else process.env.LINE_LOGIN_CHANNEL_ID=oldLogin;
   if(oldToken===undefined)delete process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;else process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=oldToken;
  }
 }finally{await db?.end();await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end()}
});
