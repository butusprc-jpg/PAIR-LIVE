import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {assertTestTarget} from '../lib/migration-manifest';
import {startManualRound,decideRound,currentRound} from '../lib/rounds/store';

test('ADMIN shows independent LIVE and round start/stop controls wired to protected routes',async()=>{
 const admin=await readFile(new URL('../app/admin/page.tsx',import.meta.url),'utf8');
 const cameras=await readFile(new URL('../components/AdminCameras.tsx',import.meta.url),'utf8');
 const controls=await readFile(new URL('../components/AdminRoundLiveControls.tsx',import.meta.url),'utf8');
 assert.match(admin,/tab==='rounds'&&[\s\S]*?<AdminRoundLiveControls role=\{role!\}/);
 assert.doesNotMatch(cameras,/<AdminRoundLiveControls/);
 assert.match(cameras,/act\('start'\)/);
 assert.match(cameras,/act\('stop'\)/);
 assert.match(cameras,/\/api\/admin\/cameras/);
 assert.match(controls,/\/api\/admin\/round\/start/);
 assert.match(controls,/\/api\/admin\/round\/decision/);
 assert.match(controls,/act\('start'\)/);
 assert.match(controls,/act\('stop'\)/);
 assert.match(controls,/act\('cancel'\)/);
 assert.match(controls,/pending=\['OPEN','CLOSED','SCANNING','REVIEW_REQUIRED'\]/);
});

const raw=process.env.V16_ROUND_BUTTON_TEST_DATABASE_URL;
test('synthetic OA can start, stop, cancel, and reopen independent of LIVE camera',{skip:!raw},async()=>{
 const url=assertTestTarget(raw),pool=new Pool({connectionString:url}),oa='@round_buttons_'+randomUUID().slice(0,12),token='synthetic-'+randomUUID(),adminId=randomUUID();
 const names=['DATABASE_URL','CONNECTED_LINE_OA_ID','LINE_MESSAGING_CHANNEL_ACCESS_TOKEN','LINE_LOGIN_CHANNEL_ID','NOTIFICATION_DELIVERY_ENABLED','PAIR_WALLET_CUTOVER_VERIFIED'];
 const old=Object.fromEntries(names.map(k=>[k,process.env[k]]));const roundIds:string[]=[];
 try{
  const config=await pool.query("INSERT INTO oa_service_control(line_oa_id,shop_name,enabled,paused,expires_at,verified_token_hash) VALUES($1,'Synthetic Round Buttons',true,false,now()+interval '1 day',$2) RETURNING id",[oa,createHash('sha256').update(token).digest('hex')]);
  assert.ok(config.rows[0].id);
  Object.assign(process.env,{DATABASE_URL:url,CONNECTED_LINE_OA_ID:oa,LINE_MESSAGING_CHANNEL_ACCESS_TOKEN:token,LINE_LOGIN_CHANNEL_ID:'synthetic-round-buttons',NOTIFICATION_DELIVERY_ENABLED:'false',PAIR_WALLET_CUTOVER_VERIFIED:'false'});
  const first=await startManualRound(adminId);roundIds.push(first.round.id);assert.equal(first.round.status,'OPEN');
  await assert.rejects(startManualRound(adminId),/round_already_active/);
  const stopped=await decideRound(adminId,first.round.id,'stop');assert.equal(stopped.status,'SCANNING');assert.equal(stopped.replayed,false);
  const again=await decideRound(adminId,first.round.id,'stop');assert.equal(again.replayed,true);
  await assert.rejects(startManualRound(adminId),/round_already_active/);
  const cancelled=await decideRound(adminId,first.round.id,'cancel');assert.equal(cancelled.status,'CANCELLED');
  assert.equal((await decideRound(adminId,first.round.id,'cancel')).replayed,true);
  assert.equal((await currentRound()).round,null);
  const second=await startManualRound(adminId);roundIds.push(second.round.id);assert.equal(second.round.status,'OPEN');assert.notEqual(second.round.id,first.round.id);
  assert.equal((await decideRound(adminId,second.round.id,'cancel')).status,'CANCELLED');
  assert.equal((await pool.query('SELECT count(*)::int n FROM round_result_line_outbox WHERE round_id=ANY($1::bigint[])',[roundIds])).rows[0].n,0);
 }finally{
  for(const key of names){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key]}
  await pool.query('DELETE FROM round_audit_logs WHERE round_id=ANY($1::bigint[])',[roundIds]).catch(()=>{});
  await pool.query('DELETE FROM rounds WHERE id=ANY($1::bigint[])',[roundIds]).catch(()=>{});
  await pool.query('DELETE FROM oa_service_control WHERE line_oa_id=$1',[oa]).catch(()=>{});
  await pool.end();
 }
});
