import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {assertTestTarget,migrationManifest} from '../lib/migration-manifest';

const raw=process.env.AUDIT_TEST_DATABASE_URL;
test('legacy entry, withdrawal, and cancellation audit exact changes once under concurrent replay',{skip:!raw},async()=>{
 const root=new Pool({connectionString:assertTestTarget(raw),ssl:false});
 const schema='audit_test_'+randomUUID().replaceAll('-','');
 await root.query(`CREATE SCHEMA ${schema}`);
 const url=new URL(raw!);url.searchParams.set('options',`-csearch_path=${schema}`);
 const db=new Pool({connectionString:url.toString(),ssl:false,max:8});
 const prior={url:process.env.DATABASE_URL,oa:process.env.CONNECTED_LINE_OA_ID,token:process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN,cutover:process.env.PAIR_WALLET_CUTOVER_VERIFIED,channel:process.env.LINE_LOGIN_CHANNEL_ID};
 let app:Pool|undefined;
 try{
  for(const migration of await migrationManifest())await db.query(migration.sql);
  process.env.DATABASE_URL=url.toString();process.env.CONNECTED_LINE_OA_ID='@audit-test';process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN='synthetic-audit-token';process.env.PAIR_WALLET_CUTOVER_VERIFIED='false';delete process.env.LINE_LOGIN_CHANNEL_ID;
  const {database}=await import('../lib/server/db');const {submitDemoEntry,decideRound}=await import('../lib/rounds/store');app=database();
  const {createWithdrawal,decideWithdrawal}=await import('../lib/withdrawal/store');
  const member=(await db.query("INSERT INTO members(display_name,demo_points) VALUES('Audit fixture',100) RETURNING id")).rows[0].id;
  const admin=(await db.query("INSERT INTO admin_identities(provider,provider_channel_id,provider_user_id,display_name) VALUES('line','audit-test','synthetic-admin','Audit admin') RETURNING id")).rows[0].id;
  await db.query("INSERT INTO oa_service_control(line_oa_id,shop_name,enabled,expires_at,verified_token_hash) VALUES('@audit-test','Audit test',true,now()+interval '1 day',$1)",[createHash('sha256').update('synthetic-audit-token').digest('hex')]);
  const round=String((await db.query("INSERT INTO rounds(round_date,opens_at,closes_at,duration_minutes,status) VALUES((now() AT TIME ZONE 'Asia/Bangkok')::date,now(),now()+interval '5 minutes',5,'OPEN') RETURNING id")).rows[0].id);
  const input={side:'even' as const,demoPoints:30,idempotencyKey:randomUUID()};
  const entries=await Promise.all([submitDemoEntry(member,round,input),submitDemoEntry(member,round,input)]);
  assert.equal(entries[0].id,entries[1].id);
  const entryAudit=(await db.query("SELECT actor,details FROM round_audit_logs WHERE round_id=$1 AND action='DEMO_ENTRY_ACCEPTED'",[round])).rows;
  assert.equal(entryAudit.length,1);assert.equal(entryAudit[0].actor,member);
  assert.deepEqual(entryAudit[0].details,{entry_id:entries[0].id,member_id:member,round_id:round,points_delta:-30,balance_before:100,balance_after:70});
  assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[member])).rows[0].demo_points,70);
  const request=await createWithdrawal(db,member,20,'synthetic destination',randomUUID(),['U'+'a'.repeat(32)]);
  const decisions=await Promise.all([decideWithdrawal(db,admin,request.id,'TRANSFERRED'),decideWithdrawal(db,admin,request.id,'TRANSFERRED')]);
  assert.equal(decisions.filter(value=>value.replayed).length,1);
  const withdrawalAudit=(await db.query('SELECT member_id,admin_id,points,balance_before,balance_after,points_changed FROM member_withdrawal_audit WHERE request_id=$1',[request.id])).rows;
  assert.deepEqual(withdrawalAudit,[{member_id:member,admin_id:admin,points:20,balance_before:70,balance_after:50,points_changed:-20}]);
  assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[member])).rows[0].demo_points,50);
  const cancelled=await Promise.all([decideRound(admin,round,'cancel'),decideRound(admin,round,'cancel')]);
  assert.equal(cancelled.filter(value=>value.replayed).length,1);
  const cancelAudit=(await db.query("SELECT actor,details FROM round_audit_logs WHERE round_id=$1 AND action='ROUND_CANCELLED'",[round])).rows;
  assert.deepEqual(cancelAudit,[{actor:admin,details:{round_id:round,refunded_entries:1,refunded_members:1,refunded_points:30,member_ids:[member]}}]);
  assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[member])).rows[0].demo_points,80);
  await db.query("INSERT INTO member_withdrawal_requests(member_id,requested_points,payout_details,idempotency_key,status,decided_at,decided_by,debit_timing) VALUES($1,1,'old request',$2,'REJECTED',now(),$3,'ON_APPROVAL') RETURNING id",[member,randomUUID(),admin]).then(async result=>{
   await db.query("INSERT INTO member_withdrawal_audit(request_id,member_id,admin_id,action,points) VALUES($1,$2,$3,'REJECTED',1)",[result.rows[0].id,member,admin]);
   const old=(await db.query('SELECT balance_before,balance_after,points_changed FROM member_withdrawal_audit WHERE request_id=$1',[result.rows[0].id])).rows[0];
   assert.deepEqual(old,{balance_before:null,balance_after:null,points_changed:null});
  });
 }finally{
  if(app)await app.end();await db.end();await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();
  for(const [key,value] of Object.entries({DATABASE_URL:prior.url,CONNECTED_LINE_OA_ID:prior.oa,LINE_MESSAGING_CHANNEL_ACCESS_TOKEN:prior.token,PAIR_WALLET_CUTOVER_VERIFIED:prior.cutover,LINE_LOGIN_CHANNEL_ID:prior.channel}))if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
});
