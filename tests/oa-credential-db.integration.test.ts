import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import test from 'node:test';
import {assertTestTarget} from '../lib/migration-manifest';
import {encryptOaSecret,decryptOaSecret} from '../lib/server/oa-crypto';

const raw=process.env.MIGRATION_TEST_DATABASE_URL;
test('two synthetic OAs retain distinct encrypted credentials and unique routing keys', {skip:!raw},async()=>{
 const db=new Pool({connectionString:assertTestTarget(raw),ssl:false,max:1}),client=await db.connect();
 const prior=process.env.OA_CREDENTIAL_ENCRYPTION_KEY;process.env.OA_CREDENTIAL_ENCRYPTION_KEY=randomBytes(32).toString('base64');
 try{
  await client.query('BEGIN');
  const ids=[];
  for(const [name,token] of [['a','token-a'],['b','token-b']]){
   const oa=(await client.query(`INSERT INTO oa_service_control(line_oa_id,shop_name,expires_at) VALUES($1,$2,now()+interval '1 day') RETURNING id`,[`@test-${randomBytes(8).toString('hex')}`,`Test ${name}`])).rows[0].id as string;
   ids.push(oa);
   const suffix=randomBytes(9).toString('hex');
   await client.query(`INSERT INTO oa_credentials(oa_id,webhook_key,login_channel_id,messaging_channel_id,liff_id,login_secret_ciphertext,messaging_secret_ciphertext,access_token_ciphertext,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'synthetic-test')`,[oa,randomBytes(32).toString('base64url'),`login-${suffix}`,`messaging-${suffix}`,`liff-${suffix}`,encryptOaSecret(oa,'login-secret',`secret-${name}`),encryptOaSecret(oa,'messaging-secret',`secret-${name}`),encryptOaSecret(oa,'access-token',token)]);
  }
  const rows=(await client.query('SELECT oa_id,access_token_ciphertext FROM oa_credentials WHERE oa_id=ANY($1::uuid[]) ORDER BY oa_id',[ids])).rows;
  assert.equal(rows.length,2);assert.notEqual(rows[0].access_token_ciphertext,rows[1].access_token_ciphertext);
  assert.equal(decryptOaSecret(rows[0].oa_id,'access-token',rows[0].access_token_ciphertext).startsWith('token-'),true);
  assert.throws(()=>decryptOaSecret(rows[1].oa_id,'access-token',rows[0].access_token_ciphertext));
  await assert.rejects(client.query('UPDATE oa_credentials SET webhook_key=(SELECT webhook_key FROM oa_credentials WHERE oa_id=$1) WHERE oa_id=$2',[rows[0].oa_id,rows[1].oa_id]),{code:'23505'});
 }finally{await client.query('ROLLBACK').catch(()=>{});client.release();await db.end();if(prior===undefined)delete process.env.OA_CREDENTIAL_ENCRYPTION_KEY;else process.env.OA_CREDENTIAL_ENCRYPTION_KEY=prior}
});
