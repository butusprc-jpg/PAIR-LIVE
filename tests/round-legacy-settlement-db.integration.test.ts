import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {assertTestTarget,migrationManifest} from '../lib/migration-manifest';
import {settleVerifiedRound} from '../lib/rounds/settlement';

const raw=process.env.SETTLEMENT_TEST_DATABASE_URL;
test('LEGACY settlement records one immutable award without activating Wallet',{skip:!raw},async()=>{
 const root=new Pool({connectionString:assertTestTarget(raw)}),schema='legacy_settle_'+randomUUID().replaceAll('-','');let db:Pool|undefined;
 const keys=['PAIR_WALLET_CUTOVER_VERIFIED','CONNECTED_LINE_OA_ID','LINE_MESSAGING_CHANNEL_ACCESS_TOKEN','LINE_LOGIN_CHANNEL_ID'];const prior=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try{await root.query(`CREATE SCHEMA ${schema}`);const url=new URL(raw!);url.searchParams.set('options',`-csearch_path=${schema}`);db=new Pool({connectionString:url.toString(),max:8});for(const migration of await migrationManifest())await db.query(migration.sql);
  const token='synthetic-legacy-token',oa='@legacy-test';Object.assign(process.env,{PAIR_WALLET_CUTOVER_VERIFIED:'false',CONNECTED_LINE_OA_ID:oa,LINE_MESSAGING_CHANNEL_ACCESS_TOKEN:token,LINE_LOGIN_CHANNEL_ID:'login-test'});
  const oaId=(await db.query("INSERT INTO oa_service_control(line_oa_id,shop_name,enabled,expires_at,verified_token_hash) VALUES($1,'Legacy Test',true,now()+interval '1 day',$2) RETURNING id",[oa,createHash('sha256').update(token).digest('hex')])).rows[0].id;
  const admin=(await db.query("INSERT INTO admin_identities(provider,provider_channel_id,provider_user_id,display_name,role) VALUES('line','login-test',$1,'Admin','admin') RETURNING id",['U'+'a'.repeat(32)])).rows[0].id;
  const member=(await db.query("INSERT INTO members(display_name,demo_points) VALUES('Legacy winner',900) RETURNING id")).rows[0].id;
  await db.query("INSERT INTO member_identities(member_id,provider,provider_channel_id,provider_user_id) VALUES($1,'line','login-test',$2)",[member,'U'+'b'.repeat(32)]);
  const round=(await db.query("INSERT INTO rounds(round_date,opens_at,closes_at,duration_minutes,status,closed_at,even_people,even_points,settlement_oa_id) VALUES(current_date,now()-interval '10 minutes',now()-interval '5 minutes',5,'SCANNING',now()-interval '5 minutes',1,100,$1) RETURNING id",[oaId])).rows[0].id;
  const entry=(await db.query("INSERT INTO round_entries(round_id,member_id,side,demo_points,idempotency_key) VALUES($1,$2,'even',100,$3) RETURNING id",[round,member,randomUUID()])).rows[0].id;
  await db.query("INSERT INTO round_audit_logs(round_id,actor,action,details) VALUES($1,'member','DEMO_ENTRY_ACCEPTED',jsonb_build_object('entry_id',$2::text))",[round,entry]);
  await db.query('INSERT INTO round_settlement_config(round_id,oa_id,rate_numerator,rate_denominator,configured_by) VALUES($1,$2,190,100,$3)',[round,oaId,admin]);
  const evidence=(await db.query("INSERT INTO round_ocr_evidence(round_id,frame_id,source_type,captured_at,raw_ocr_text,normalized_text,confidence,original_sha256,crop_sha256,original_object_key,crop_object_key) VALUES($1,'synthetic-frame','IP_CAMERA',now(),'2.48','2.48',99,repeat('a',64),repeat('b',64),'test/original','test/crop') RETURNING id",[round])).rows[0].id;
  await db.query("INSERT INTO round_ocr_verification_decisions(evidence_id,decision,actor) VALUES($1,'VERIFIED','test-admin')",[evidence]);
  const [a,b]=await Promise.all([settleVerifiedRound(db,admin,String(round)),settleVerifiedRound(db,admin,String(round))]);assert.deepEqual([a.replayed,b.replayed].sort(),[false,true]);
  assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[member])).rows[0].demo_points,1090);
  const ledger=(await db.query('SELECT points,balance_before,balance_after FROM round_legacy_award_ledger WHERE entry_id=$1',[entry])).rows;
  assert.deepEqual(ledger,[{points:'190',balance_before:'900',balance_after:'1090'}]);
  assert.equal((await db.query('SELECT phase FROM member_wallet_runtime_state WHERE id=1')).rows[0].phase,'LEGACY');
  assert.equal((await db.query('SELECT count(*)::int n FROM member_wallets')).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int n FROM round_result_line_outbox WHERE round_id=$1',[round])).rows[0].n,1);
  await assert.rejects(db.query('UPDATE round_legacy_award_ledger SET points=1 WHERE entry_id=$1',[entry]),/round_legacy_award_immutable/);
 }finally{for(const key of keys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key]}await db?.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end()}
});
