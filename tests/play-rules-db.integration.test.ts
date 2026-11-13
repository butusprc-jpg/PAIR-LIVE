import test from 'node:test';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import {assertTestTarget} from '../lib/migration-manifest';
import {readPlayRules,savePlayRules} from '../lib/play-rules/store';
const raw=process.env.MIGRATION_TEST_DATABASE_URL;
test('play rules persist per verified OA; unauthorized channels cannot read or write',{skip:!raw},async()=>{
 const db=new Pool({connectionString:assertTestTarget(raw),ssl:false});
 const prior={channel:process.env.LINE_LOGIN_CHANNEL_ID,oa:process.env.CONNECTED_LINE_OA_ID,token:process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN};
 const key='@rules-'+randomUUID(),token='synthetic-'+randomUUID();
 const oa=(await db.query<{id:string}>(`INSERT INTO oa_service_control(line_oa_id,shop_name,enabled,expires_at,verified_token_hash) VALUES($1,'Rules test',true,now()+interval '1 day',$2) RETURNING id`,[key,createHash('sha256').update(token).digest('hex')])).rows[0].id;
 try{
  process.env.LINE_LOGIN_CHANNEL_ID='rules-ci-channel';process.env.CONNECTED_LINE_OA_ID=key;process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=token;
  assert.equal((await readPlayRules(db,'rules-ci-channel')).content,'');
  assert.equal((await savePlayRules(db,'rules-ci-channel','admin-fixture','ข้อ 1 <script>alert(1)</script>')).content,'ข้อ 1 <script>alert(1)</script>');
  assert.equal((await readPlayRules(db,'rules-ci-channel')).content,'ข้อ 1 <script>alert(1)</script>');
  await assert.rejects(readPlayRules(db,'other-channel'),/oa_binding_unverified/);
  await assert.rejects(savePlayRules(db,'other-channel','other','tampered'),/oa_binding_unverified/);
  await assert.rejects(savePlayRules(db,'rules-ci-channel','admin-fixture','x'.repeat(10001)),/invalid_play_rules/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM play_rules WHERE oa_id=$1',[oa])).rows[0].n,1);
 }finally{
  await db.query('DELETE FROM play_rules WHERE oa_id=$1',[oa]);await db.query('DELETE FROM oa_service_control WHERE id=$1',[oa]);await db.end();
  for(const [key,value] of Object.entries({LINE_LOGIN_CHANNEL_ID:prior.channel,CONNECTED_LINE_OA_ID:prior.oa,LINE_MESSAGING_CHANNEL_ACCESS_TOKEN:prior.token})){if(value===undefined)delete process.env[key];else process.env[key]=value}
 }
});
