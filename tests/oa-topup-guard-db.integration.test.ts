import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {assertTestTarget,migrationManifest} from '../lib/migration-manifest';
import {encryptOaSecret} from '../lib/server/oa-crypto';
import {decideTopup} from '../lib/topup/store';

const raw=process.env.TOPUP_TEST_DATABASE_URL;
test('two OA approvals roll back cross-tenant credits and replay once', {skip:!raw},async()=>{
 const root=new Pool({connectionString:assertTestTarget(raw),ssl:false,max:2});
 const schema='oa_credit_'+randomUUID().replaceAll('-','');const old=process.env.OA_CREDENTIAL_ENCRYPTION_KEY;
 process.env.OA_CREDENTIAL_ENCRYPTION_KEY=randomBytes(32).toString('base64');let db:Pool|undefined;
 try{
  await root.query(`CREATE SCHEMA ${schema}`);
  const url=new URL(raw!);url.searchParams.set('options',`-csearch_path=${schema}`);db=new Pool({connectionString:url.toString(),ssl:false,max:8});
  for(const migration of await migrationManifest())await db.query(migration.sql);
  const oaIds:string[]=[],adminIds:string[]=[],channels:string[]=[];
  for(const shop of ['a','b']){
   const suffix=randomBytes(8).toString('hex'),channel=`login-${suffix}`;channels.push(channel);
   const oa=(await db.query(`INSERT INTO oa_service_control(line_oa_id,shop_name,expires_at,enabled) VALUES($1,$2,now()+interval '1 day',true) RETURNING id`,[`@synthetic-${suffix}`,`Shop ${shop}`])).rows[0].id;oaIds.push(oa);
   await db.query(`INSERT INTO oa_credentials(oa_id,webhook_key,login_channel_id,messaging_channel_id,liff_id,login_secret_ciphertext,messaging_secret_ciphertext,access_token_ciphertext,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'test')`,[oa,randomBytes(32).toString('base64url'),channel,`msg-${suffix}`,`liff-${suffix}`,encryptOaSecret(oa,'login-secret','synthetic'),encryptOaSecret(oa,'messaging-secret','synthetic'),encryptOaSecret(oa,'access-token','synthetic')]);
   const admin=(await db.query(`INSERT INTO admin_identities(provider,provider_channel_id,provider_user_id,display_name,role) VALUES('line',$1,$2,$3,'admin') RETURNING id`,[channel,'U'+(shop==='a'?'a':'b').repeat(32),`Admin ${shop}`])).rows[0].id;adminIds.push(admin);
  }
  const member=(await db.query("INSERT INTO members(display_name,demo_points) VALUES('Synthetic B',100) RETURNING id")).rows[0].id;
  await db.query("INSERT INTO member_identities(member_id,provider,provider_channel_id,provider_user_id) VALUES($1,'line',$2,$3)",[member,channels[1],'U'+'c'.repeat(32)]);
  async function request(points:number){const c=await db!.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('pair_live.topup_admin','true',true)");const row=(await c.query('INSERT INTO member_topup_requests(member_id,requested_points,idempotency_key,oa_id) VALUES($1,$2,$3,$4) RETURNING id',[member,points,randomUUID(),oaIds[1]])).rows[0];await c.query('COMMIT');return row.id as string}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
  const approval=await request(50);
  await assert.rejects(decideTopup(db,adminIds[0],approval,'APPROVED','synthetic'),/oa_decision_forbidden/);
  assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[member])).rows[0].demo_points,100);
  assert.equal((await db.query('SELECT count(*)::int n FROM member_topup_audit WHERE request_id=$1',[approval])).rows[0].n,0);
  const results=await Promise.all([decideTopup(db,adminIds[1],approval,'APPROVED','synthetic'),decideTopup(db,adminIds[1],approval,'APPROVED','synthetic')]);
  assert.deepEqual(results.map(x=>x.replayed).sort(),[false,true]);
  assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[member])).rows[0].demo_points,150);
  assert.equal((await db.query('SELECT count(*)::int n FROM member_topup_audit WHERE request_id=$1',[approval])).rows[0].n,1);
  const rejection=await request(25);await assert.rejects(decideTopup(db,adminIds[0],rejection,'REJECTED','synthetic'),/oa_decision_forbidden/);
  assert.equal((await decideTopup(db,adminIds[1],rejection,'REJECTED','synthetic')).status,'REJECTED');
  assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[member])).rows[0].demo_points,150);
 }finally{if(db)await db.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();if(old===undefined)delete process.env.OA_CREDENTIAL_ENCRYPTION_KEY;else process.env.OA_CREDENTIAL_ENCRYPTION_KEY=old}
});
