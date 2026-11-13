import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {assertTestTarget,migrationManifest} from '../lib/migration-manifest';
import {settleVerifiedRound} from '../lib/rounds/settlement';
import {startManualRound} from '../lib/rounds/store';
import {database} from '../lib/server/db';
import {applyWalletMutationWithClient} from '../modules/member-wallet/server/postgres';
import {resultParity} from '../lib/line/game-notices';

const raw=process.env.SETTLEMENT_TEST_DATABASE_URL;
test('verified settlement credits once with wallet ledger and rejects unready rounds',{skip:!raw},async()=>{
 const root=new Pool({connectionString:assertTestTarget(raw)}),schema='settlement_test_'+randomUUID().replaceAll('-','');let db:Pool|undefined;
 const keys=['DATABASE_URL','PAIR_WALLET_CUTOVER_VERIFIED','CONNECTED_LINE_OA_ID','LINE_MESSAGING_CHANNEL_ACCESS_TOKEN','LINE_LOGIN_CHANNEL_ID'];const old=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try{await root.query(`CREATE SCHEMA ${schema}`);const url=new URL(raw!);url.searchParams.set('options',`-csearch_path=${schema}`);db=new Pool({connectionString:url.toString(),max:12});for(const migration of await migrationManifest())await db.query(migration.sql);
  const token='synthetic-settlement-token',oa='@settlement-test';Object.assign(process.env,{DATABASE_URL:url.toString(),PAIR_WALLET_CUTOVER_VERIFIED:'true',CONNECTED_LINE_OA_ID:oa,LINE_MESSAGING_CHANNEL_ACCESS_TOKEN:token,LINE_LOGIN_CHANNEL_ID:'login-test'});
  const oaId=(await db.query("INSERT INTO oa_service_control(line_oa_id,shop_name,enabled,expires_at,verified_token_hash) VALUES($1,'Test OA',true,now()+interval '1 day',$2) RETURNING id",[oa,createHash('sha256').update(token).digest('hex')])).rows[0].id;
  const admin=(await db.query("INSERT INTO admin_identities(provider,provider_channel_id,provider_user_id,display_name,role) VALUES('line','login-test',$1,'Test Admin','admin') RETURNING id",['U'+'a'.repeat(32)])).rows[0].id;
  await db.query("UPDATE member_wallet_runtime_state SET phase='CUTOVER_PENDING' WHERE id=1");await db.query("UPDATE member_wallet_runtime_state SET phase='WALLET_ACTIVE',enabled=true,ever_cutover=true,cutover_at=now() WHERE id=1");
  const members:string[]=[];for(let i=0;i<2;i++){const id=(await db.query('INSERT INTO members(display_name,demo_points) VALUES($1,0) RETURNING id',[`Synthetic ${i}`])).rows[0].id;members.push(id);
   await db.query("INSERT INTO member_identities(member_id,provider,provider_channel_id,provider_user_id) VALUES($1,'line','login-test',$2)",[id,'U'+String(i+1).repeat(32)]);
   const c=await db.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('pair_live.member_id',$1,true)",[id]);await applyWalletMutationWithClient(c,{memberId:id,type:'DEMO_GRANT',points:1000,referenceId:`fixture:${id}`,idempotencyKey:`fixture:${id}`,actor:'test',source:'internal'});await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
  const round=(await db.query("INSERT INTO rounds(round_date,opens_at,closes_at,duration_minutes,status,closed_at,even_people,even_points,odd_people,odd_points,settlement_oa_id) VALUES(current_date,now()-interval '10 minutes',now()-interval '5 minutes',5,'SCANNING',now()-interval '5 minutes',1,100,1,100,$1) RETURNING id",[oaId])).rows[0].id;
  const entries:string[]=[];for(let i=0;i<2;i++){const memberId=members[i],key=randomUUID(),side=i?'odd':'even';const c=await db.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('pair_live.member_id',$1,true)",[memberId]);await applyWalletMutationWithClient(c,{memberId,type:'DEMO_USE',points:100,referenceId:`ROUND_${round}_${key}`,idempotencyKey:key,actor:'test',source:'round'});const entry=(await c.query('INSERT INTO round_entries(round_id,member_id,side,demo_points,idempotency_key) VALUES($1,$2,$3,100,$4) RETURNING id',[round,memberId,side,key])).rows[0].id;entries.push(entry);await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
  const balance=async(id:string)=>Number((await db!.query('SELECT available_points FROM member_wallets WHERE member_id=$1',[id])).rows[0].available_points);
  assert.equal(await balance(members[0]),900);assert.equal(await balance(members[1]),900);
  await assert.rejects(settleVerifiedRound(db,admin,String(round)),/settlement_rate_or_oa_missing/);
  await db.query('INSERT INTO round_settlement_config(round_id,oa_id,rate_numerator,rate_denominator,configured_by) VALUES($1,$2,190,100,$3)',[round,oaId,admin]);
  await assert.rejects(settleVerifiedRound(db,admin,String(round)),/verified_result_missing_or_ambiguous/);
  const evidence=(await db.query("INSERT INTO round_ocr_evidence(round_id,frame_id,source_type,captured_at,raw_ocr_text,normalized_text,confidence,original_sha256,crop_sha256,original_object_key,crop_object_key) VALUES($1,'frame-1','IP_CAMERA',now(),'2.48','2.48',99,repeat('a',64),repeat('b',64),'test/original','test/crop') RETURNING id",[round])).rows[0].id;
  await db.query("INSERT INTO round_ocr_verification_decisions(evidence_id,decision,actor) VALUES($1,'VERIFIED','test-admin')",[evidence]);
  assert.equal(resultParity('2.48'),'even');assert.equal(resultParity('3.27'),'odd');assert.equal(resultParity('4.60'),'even');assert.throws(()=>resultParity('bad'));
  await assert.rejects(settleVerifiedRound(db,randomUUID(),String(round)),/admin_forbidden/);
  process.env.CONNECTED_LINE_OA_ID='@wrong-oa';await assert.rejects(settleVerifiedRound(db,admin,String(round)),/settlement_rate_or_oa_missing/);process.env.CONNECTED_LINE_OA_ID=oa;
  process.env.PAIR_WALLET_CUTOVER_VERIFIED='false';await assert.rejects(settleVerifiedRound(db,admin,String(round)),/wallet_cutover_gate_mismatch/);process.env.PAIR_WALLET_CUTOVER_VERIFIED='true';
  await db.query("UPDATE member_identities SET provider_channel_id='other-login' WHERE member_id=$1",[members[1]]);
  await assert.rejects(settleVerifiedRound(db,admin,String(round)),/entry_member_oa_mismatch/);
  assert.equal(await balance(members[0]),900);
  await db.query("UPDATE member_identities SET provider_channel_id='login-test' WHERE member_id=$1",[members[1]]);
  await db.query("CREATE FUNCTION fail_settlement_award() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic_award_failure'; END$$");
  await db.query('CREATE TRIGGER fail_settlement_award BEFORE INSERT ON round_settlement_awards FOR EACH ROW EXECUTE FUNCTION fail_settlement_award()');
  await assert.rejects(settleVerifiedRound(db,admin,String(round)),/synthetic_award_failure/);
  assert.equal(await balance(members[0]),900);assert.equal((await db.query('SELECT status FROM rounds WHERE id=$1',[round])).rows[0].status,'SCANNING');
  assert.equal((await db.query("SELECT count(*)::int n FROM member_wallet_ledger WHERE reference_id=$1",[`ROUND_AWARD_${entries[0]}`])).rows[0].n,0);
  await db.query('DROP TRIGGER fail_settlement_award ON round_settlement_awards');
  const pair=await Promise.all([settleVerifiedRound(db,admin,String(round)),settleVerifiedRound(db,admin,String(round))]);assert.deepEqual(pair.map(x=>x.replayed).sort(),[false,true]);
  assert.equal(await balance(members[0]),1090);assert.equal(await balance(members[1]),900);
  for(let i=0;i<5;i++)assert.equal((await settleVerifiedRound(db,admin,String(round))).replayed,true);
  assert.deepEqual((await db.query('SELECT status FROM round_entries WHERE round_id=$1 ORDER BY side',[round])).rows.map(x=>x.status),['CORRECT','INCORRECT']);
  assert.equal((await db.query('SELECT count(*)::int n FROM round_settlement_awards WHERE round_id=$1',[round])).rows[0].n,1);
  assert.equal((await db.query("SELECT count(*)::int n FROM member_wallet_ledger WHERE reference_id=$1",[`ROUND_AWARD_${entries[0]}`])).rows[0].n,1);
  assert.equal((await db.query("SELECT count(*)::int n FROM round_audit_logs WHERE round_id=$1 AND action='ROUND_SETTLED'",[round])).rows[0].n,1);
  await db.query('INSERT INTO round_reset_epochs(created_at) VALUES(now())');
  await assert.rejects(settleVerifiedRound(db,admin,String(round)),/round_not_found/);
  const fresh=await startManualRound(admin);assert.equal((await db.query('SELECT settlement_oa_id FROM rounds WHERE id=$1',[fresh.round.id])).rows[0].settlement_oa_id,oaId);
 }finally{if(process.env.DATABASE_URL&&process.env.DATABASE_URL!==old.DATABASE_URL)await database().end();for(const key of keys){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key]}await db?.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end()}
});
