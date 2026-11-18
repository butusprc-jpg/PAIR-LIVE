import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {assertTestTarget,migrationManifest} from '../lib/migration-manifest';
import {snapshotLiveStart} from '../lib/line/payload-snapshot';
import {dispatchLiveStartLine} from '../lib/line/live-start-notify';

const raw=process.env.LINE_PAYLOAD_TEST_DATABASE_URL;
test('LIVE payload is frozen through 503, locale change, concurrent retry, and legacy migration',{skip:!raw},async()=>{
 const root=new Pool({connectionString:assertTestTarget(raw)}),schema='line_payload_'+randomUUID().replaceAll('-','');let db:Pool|undefined;
 const keys=['CONNECTED_LINE_OA_ID','LINE_MESSAGING_CHANNEL_ACCESS_TOKEN','LINE_LOGIN_CHANNEL_ID','LINE_MESSAGING_CHANNEL_ID','LINE_LOGIN_PROVIDER_ID','LINE_MESSAGING_PROVIDER_ID','NEXT_PUBLIC_LINE_LIFF_ID','NEXT_PUBLIC_APP_BASE_URL'];
 const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try{
  await root.query(`CREATE SCHEMA ${schema}`);const url=new URL(raw!);url.searchParams.set('options',`-csearch_path=${schema}`);db=new Pool({connectionString:url.toString(),max:8});
  const migrations=await migrationManifest();for(const migration of migrations.slice(0,-1))await db.query(migration.sql);
  const token='synthetic-live-token',oa='@live-payload-test',user='U'+'c'.repeat(32);
  Object.assign(process.env,{CONNECTED_LINE_OA_ID:oa,LINE_MESSAGING_CHANNEL_ACCESS_TOKEN:token,LINE_LOGIN_CHANNEL_ID:'login-test',LINE_MESSAGING_CHANNEL_ID:'messaging-test',LINE_LOGIN_PROVIDER_ID:'provider-test',LINE_MESSAGING_PROVIDER_ID:'provider-test',NEXT_PUBLIC_LINE_LIFF_ID:'2012365283-j7QSoLC2'});
  const oaId=(await db.query("INSERT INTO oa_service_control(line_oa_id,shop_name,enabled,expires_at,verified_token_hash) VALUES($1,'Synthetic Shop',true,now()+interval '1 day',$2) RETURNING id",[oa,createHash('sha256').update(token).digest('hex')])).rows[0].id;
  const member=(await db.query("INSERT INTO members(display_name,notification_locale) VALUES('Synthetic Live Member','zh-CN') RETURNING id")).rows[0].id;
  await db.query('INSERT INTO member_countdown_line_preferences(member_id,enabled) VALUES($1,true)',[member]);
  await db.query("INSERT INTO vdo_ninja_tenants(oa_id,stream_id,display_enabled,revision) VALUES($1,'syntheticstream',true,1)",[oaId]);
  const old=(await db.query("INSERT INTO live_start_line_events(oa_id,live_revision,shop_name) VALUES($1,0,'Synthetic Shop') RETURNING id",[oaId])).rows[0].id;
  await db.query("INSERT INTO live_start_line_outbox(event_id,member_id,oa_id,recipient_user_id,status,attempts) VALUES($1,$2,$3,$4,'FAILED',1)",[old,member,oaId,user]);
  const first=(await db.query("INSERT INTO live_start_line_events(oa_id,live_revision,shop_name) VALUES($1,1,'Synthetic Shop') RETURNING id",[oaId])).rows[0].id;
  await db.query('INSERT INTO live_start_line_outbox(event_id,member_id,oa_id,recipient_user_id) VALUES($1,$2,$3,$4)',[first,member,oaId,user]);
  await db.query(migrations.at(-1)!.sql);
  const review=(await db.query('SELECT status,attempts,last_error FROM live_start_line_outbox WHERE event_id=$1',[old])).rows[0];
  assert.deepEqual(review,{status:'FAILED',attempts:5,last_error:'payload_snapshot_review_required'});
  const requests:{body:string;key:string|null}[]=[];
  const fetcher:typeof fetch=async(input,init)=>{const target=String(input);if(target.endsWith('/quota'))return Response.json({type:'limited',value:100});if(target.endsWith('/consumption'))return Response.json({totalUsage:0});requests.push({body:String(init?.body),key:new Headers(init?.headers).get('X-Line-Retry-Key')});return new Response('',{status:requests.length===1?503:200})};
  assert.equal((await dispatchLiveStartLine(db,fetcher))?.status,'FAILED');
  assert.equal((await db.query('SELECT payload_locale FROM live_start_line_outbox WHERE event_id=$1',[first])).rows[0].payload_locale,'zh-CN');
  await assert.rejects(db.query("UPDATE live_start_line_outbox SET payload_locale='en' WHERE event_id=$1",[first]),/line_outbox_payload_immutable/);
  await assert.rejects(db.query("UPDATE live_start_line_outbox SET recipient_user_id=$2 WHERE event_id=$1",[first,'U'+'d'.repeat(32)]),/line_outbox_payload_immutable/);
  await db.query("UPDATE members SET notification_locale='en' WHERE id=$1",[member]);
  await db.query("UPDATE live_start_line_outbox SET next_attempt_at=now()-interval '1 second' WHERE event_id=$1",[first]);
  await db.end();db=new Pool({connectionString:url.toString(),max:8}); // fresh worker database connections
  const concurrent=await Promise.all([dispatchLiveStartLine(db,fetcher),dispatchLiveStartLine(db,fetcher)]);
  assert.equal(concurrent.filter(x=>x?.status==='SENT').length,1);assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);
  assert.equal(JSON.parse(requests[0].body).to,user);assert.equal(await dispatchLiveStartLine(db,fetcher),null);
  await db.query("UPDATE vdo_ninja_tenants SET revision=2 WHERE oa_id=$1",[oaId]);
  const next=(await db.query("INSERT INTO live_start_line_events(oa_id,live_revision,shop_name) VALUES($1,2,'Synthetic Shop') RETURNING id",[oaId])).rows[0].id;
  await db.query('INSERT INTO live_start_line_outbox(event_id,member_id,oa_id,recipient_user_id) VALUES($1,$2,$3,$4)',[next,member,oaId,user]);
  const client=await db.connect();try{await client.query('BEGIN');await snapshotLiveStart(client,next);await client.query('COMMIT')}finally{client.release()}
  assert.equal((await db.query('SELECT payload_locale FROM live_start_line_outbox WHERE event_id=$1',[next])).rows[0].payload_locale,'en');
  const newAttempts:{body:string;key:string|null}[]=[];
  const timeoutFetch:typeof fetch=async(input,init)=>{const target=String(input);if(target.endsWith('/quota'))return Response.json({type:'limited',value:100});if(target.endsWith('/consumption'))return Response.json({totalUsage:0});newAttempts.push({body:String(init?.body),key:new Headers(init?.headers).get('X-Line-Retry-Key')});if(newAttempts.length===1)throw new Error('synthetic_network_timeout');return new Response('',{status:200})};
  assert.equal((await dispatchLiveStartLine(db,timeoutFetch))?.status,'FAILED');
  await db.query("UPDATE live_start_line_outbox SET next_attempt_at=now()-interval '1 second' WHERE event_id=$1",[next]);
  assert.equal((await dispatchLiveStartLine(db,timeoutFetch))?.status,'SENT');
  assert.deepEqual(newAttempts[0],newAttempts[1]);assert.notEqual(newAttempts[0].body,requests[0].body);
  delete process.env.NEXT_PUBLIC_LINE_LIFF_ID;delete process.env.NEXT_PUBLIC_APP_BASE_URL;
  const bad=(await db.query("INSERT INTO live_start_line_events(oa_id,live_revision,shop_name) VALUES($1,3,'Synthetic Shop') RETURNING id",[oaId])).rows[0].id;
  await db.query('INSERT INTO live_start_line_outbox(event_id,member_id,oa_id,recipient_user_id) VALUES($1,$2,$3,$4)',[bad,member,oaId,user]);
  const failedClient=await db.connect();try{await failedClient.query('BEGIN');await snapshotLiveStart(failedClient,bad);await failedClient.query('COMMIT')}finally{failedClient.release()}
  assert.deepEqual((await db.query('SELECT status,attempts,last_error FROM live_start_line_outbox WHERE event_id=$1',[bad])).rows[0],{status:'FAILED',attempts:5,last_error:'payload_render_failed'});
 }finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key]}await db?.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end()}
});
