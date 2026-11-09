import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import test from 'node:test';
import {assertTestTarget} from '../lib/migration-manifest';
import {rotateOaCredentials,resolveWebhookOa} from '../lib/owner/credential-store';

const raw=process.env.MIGRATION_TEST_DATABASE_URL;
test('owner rotation commits per OA, rejects wrong bot and keeps audit', {skip:!raw},async()=>{
 const pool=new Pool({connectionString:assertTestTarget(raw),ssl:false,max:2});const old=process.env.OA_CREDENTIAL_ENCRYPTION_KEY;
 process.env.OA_CREDENTIAL_ENCRYPTION_KEY=randomBytes(32).toString('base64');const ids:string[]=[];
 try{
  for(const name of ['a','b']){
   const oa=(await pool.query(`INSERT INTO oa_service_control(line_oa_id,shop_name,expires_at,enabled) VALUES($1,$2,now()+interval '1 day',true) RETURNING id`,[`@synthetic-${randomBytes(8).toString('hex')}`,`Synthetic ${name}`])).rows[0];ids.push(oa.id);
   const suffix=randomBytes(9).toString('hex');const input={loginChannelId:`login-${suffix}`,messagingChannelId:`msg-${suffix}`,liffId:`liff-${suffix}`,loginSecret:`login-secret-${name}`,messagingSecret:`msg-secret-${name}`,accessToken:`synthetic-token-${name}`};
   await assert.rejects(rotateOaCredentials(pool,oa.id,'owner',input,async()=>{throw Error('wrong_bot')}),/wrong_bot/);
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM oa_credentials WHERE oa_id=$1',[oa.id])).rows[0].n,0);
   const created=await rotateOaCredentials(pool,oa.id,'owner',input,async()=> 'synthetic-verified');
   assert.equal(created.keyVersion,1);
   const rotated=await rotateOaCredentials(pool,oa.id,'owner',{...input,accessToken:`new-${name}`},async()=> 'synthetic-verified');
   assert.equal(rotated.keyVersion,2);assert.equal(rotated.webhookKey,created.webhookKey);
   const resolved=await resolveWebhookOa(pool,created.webhookKey);assert.equal(resolved?.accessToken,`new-${name}`);
   assert.equal((await pool.query('SELECT action FROM oa_credential_audit WHERE oa_id=$1 ORDER BY key_version',[oa.id])).rows.map(x=>x.action).join(','),'CREATE,ROTATE');
  }
  const a=(await pool.query('SELECT webhook_key FROM oa_credentials WHERE oa_id=$1',[ids[0]])).rows[0].webhook_key;
  const b=(await pool.query('SELECT webhook_key FROM oa_credentials WHERE oa_id=$1',[ids[1]])).rows[0].webhook_key;
  assert.notEqual(a,b);assert.notEqual((await resolveWebhookOa(pool,a))?.accessToken,(await resolveWebhookOa(pool,b))?.accessToken);
 }finally{
  if(ids.length){await pool.query('DELETE FROM oa_credential_audit WHERE oa_id=ANY($1::uuid[])',[ids]);await pool.query('DELETE FROM oa_credentials WHERE oa_id=ANY($1::uuid[])',[ids]);await pool.query('DELETE FROM oa_service_control WHERE id=ANY($1::uuid[])',[ids])}
  await pool.end();if(old===undefined)delete process.env.OA_CREDENTIAL_ENCRYPTION_KEY;else process.env.OA_CREDENTIAL_ENCRYPTION_KEY=old;
 }
});
