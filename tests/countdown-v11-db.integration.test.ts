import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {Pool} from 'pg';
import {assertTestTarget} from '../lib/migration-manifest';
import {changeCountdown,countdownLabel,countdownSeconds,readCountdown,readCountdownDuration,saveCountdownDuration,setMemberCountdownPreference} from '../lib/rounds/countdown-control';
import {dispatchCountdownLine,countdownMessage} from '../lib/line/countdown-notify';
import {tickRoundEngine,submitDemoEntry} from '../lib/rounds/store';
import {RoundError} from '../lib/rounds/core';
const raw=process.env.COUNTDOWN_V11_TEST_DATABASE_URL;
test('V11 countdown and opt-in outbox are atomic, single-start and isolated',{skip:!raw},async()=>{
 const url=assertTestTarget(raw),db=new Pool({connectionString:url,ssl:false});const old=Object.fromEntries(['DATABASE_URL','CONNECTED_LINE_OA_ID','LINE_MESSAGING_CHANNEL_ACCESS_TOKEN','LINE_LOGIN_PROVIDER_ID','LINE_MESSAGING_PROVIDER_ID','LINE_LOGIN_CHANNEL_ID','LINE_MESSAGING_CHANNEL_ID'].map(key=>[key,process.env[key]]));
 const oa='@v11_'+randomUUID().slice(0,8),token='isolated-token',user='U'+randomUUID().replace(/-/g,'').slice(0,32),admin=randomUUID();let oaId='',memberId='';const roundIds:string[]=[];
 try{
  Object.assign(process.env,{DATABASE_URL:url,CONNECTED_LINE_OA_ID:oa,LINE_MESSAGING_CHANNEL_ACCESS_TOKEN:token,LINE_LOGIN_PROVIDER_ID:'test-provider',LINE_MESSAGING_PROVIDER_ID:'test-provider',LINE_LOGIN_CHANNEL_ID:'login-test',LINE_MESSAGING_CHANNEL_ID:'messaging-test'});
  const oaRow=await db.query(`INSERT INTO oa_service_control(line_oa_id,shop_name,enabled,paused,expires_at,verified_token_hash) VALUES($1,'isolated-test',true,false,now()+interval '1 day',$2) RETURNING id`,[oa,createHash('sha256').update(token).digest('hex')]);oaId=oaRow.rows[0].id;
  const m=await db.query("INSERT INTO members(display_name) VALUES('isolated-countdown-member') RETURNING id,demo_points");memberId=m.rows[0].id;assert.equal(m.rows[0].demo_points,0);
  await db.query(`INSERT INTO member_identities(member_id,provider,provider_user_id,provider_channel_id) VALUES($1,'line',$2,'login-test')`,[memberId,user]);
  await setMemberCountdownPreference(db,memberId,true);
  assert.equal(countdownSeconds(0.5),30);assert.equal(countdownSeconds(1),60);assert.equal(countdownSeconds(2),120);assert.equal(countdownSeconds(1.25),75);assert.equal(countdownLabel(30),'30 วินาที');assert.match(countdownMessage('25',30),/รอบที่: 25[\s\S]*30 วินาที/);
  for(const minutes of [0.5,1,2]){
   await saveCountdownDuration(db,minutes);assert.equal((await readCountdownDuration(db)).seconds,minutes*60);
   const r=await db.query(`INSERT INTO rounds(round_date,opens_at,closes_at,duration_minutes,status) VALUES(current_date,now(),now()+interval '5 minutes',5,'OPEN') RETURNING id,countdown_started_at`,[]);const id=String(r.rows[0].id);roundIds.push(id);assert.equal(r.rows[0].countdown_started_at,null);
   assert.equal(Number((await db.query('SELECT count(*)::int AS n FROM round_countdown_line_outbox WHERE round_id=$1',[id])).rows[0].n),0);
   if(minutes===2){process.env.LINE_MESSAGING_PROVIDER_ID='wrong-provider';await assert.rejects(changeCountdown(db,'start',admin),(e:unknown)=>e instanceof RoundError&&e.code==='countdown_line_not_ready');process.env.LINE_MESSAGING_PROVIDER_ID='test-provider';await db.query('UPDATE oa_service_control SET paused=true WHERE id=$1',[oaId]);await assert.rejects(changeCountdown(db,'start',admin),(e:unknown)=>e instanceof RoundError&&e.code==='oa_service_inactive');await db.query('UPDATE oa_service_control SET paused=false WHERE id=$1',[oaId])}const starts=minutes===2?await Promise.all([changeCountdown(db,'start',admin),changeCountdown(db,'start',admin)]):[await changeCountdown(db,'start',admin)];const started=starts[0];if(minutes===2)assert.equal(starts.filter(x=>x.replayed).length,1);assert.equal(started.countdown.durationSeconds,minutes*60);assert.equal(started.countdown.recipients,1);
   const repeat=await changeCountdown(db,'start',admin);assert.equal(repeat.replayed,true);assert.equal(Number((await db.query('SELECT count(*)::int AS n FROM round_countdown_line_outbox WHERE round_id=$1',[id])).rows[0].n),1);
   const eventCount=await db.query("SELECT count(*)::int AS n FROM round_audit_logs WHERE round_id=$1 AND action='COUNTDOWN_STARTED'",[id]);assert.equal(eventCount.rows[0].n,1);
   if(minutes===0.5){await saveCountdownDuration(db,2);assert.equal((await readCountdown(db,id)).countdown?.durationSeconds,30);await changeCountdown(db,'stop',admin);assert.equal((await readCountdown(db,id)).countdown?.status,'STOPPED')}
   else if(minutes===1){await db.query("UPDATE rounds SET countdown_ends_at=clock_timestamp()-interval '1 second' WHERE id=$1",[id]);const state=await tickRoundEngine({allowAutoStart:false});assert.equal(state.round?.status,'CLOSED');await assert.rejects(submitDemoEntry(memberId,id,{side:'even',demoPoints:1,idempotencyKey:randomUUID()}),(error:unknown)=>error instanceof RoundError&&error.code==='round_closed');assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[memberId])).rows[0].demo_points,0)}
   if(minutes!==2)await db.query("UPDATE rounds SET status='SETTLED',settled_at=now() WHERE id=$1",[id]);
  }
  const pushCalls:string[]=[];const fakeFetch=(async(input:RequestInfo|URL)=>{const address=String(input);if(address.endsWith('/quota'))return Response.json({type:'limited',value:100});if(address.endsWith('/consumption'))return Response.json({totalUsage:0});pushCalls.push(address);return new Response('',{status:pushCalls.length===1?503:200})}) as typeof fetch;
  for(let i=0;i<2;i++)await dispatchCountdownLine(db,fakeFetch);await Promise.all([dispatchCountdownLine(db,fakeFetch),dispatchCountdownLine(db,fakeFetch)]);
  assert.equal(pushCalls.length,1); // stopped and expired countdowns never send.
  const pending=await db.query("SELECT status,last_error FROM round_countdown_line_outbox WHERE round_id=$1",[roundIds[2]]);assert.equal(pending.rows[0].status,'FAILED');assert.equal(pending.rows[0].last_error,'line_temporary');
  await db.query('UPDATE round_countdown_line_outbox SET next_attempt_at=now() WHERE round_id=$1',[roundIds[2]]);await dispatchCountdownLine(db,fakeFetch);assert.equal(pushCalls.length,2);assert.equal((await db.query('SELECT status FROM round_countdown_line_outbox WHERE round_id=$1',[roundIds[2]])).rows[0].status,'SENT');
  const rows=await db.query('SELECT round_id,status FROM round_countdown_line_outbox WHERE round_id=ANY($1::bigint[]) ORDER BY round_id',[roundIds]);assert.equal(rows.rows.length,3);await db.query("UPDATE rounds SET status='SETTLED',settled_at=now() WHERE id=$1",[roundIds[2]]);assert.equal((await db.query('SELECT count(*)::int AS n FROM round_countdown_line_outbox WHERE round_id=ANY($1::bigint[]) AND oa_id=$2',[roundIds,oaId])).rows[0].n,3);
  const other=await db.query(`INSERT INTO oa_service_control(line_oa_id,shop_name,enabled,expires_at) VALUES($1,'other',false,now()+interval '1 day') RETURNING id`,['@other_'+randomUUID().slice(0,8)]);await db.query('DELETE FROM oa_service_control WHERE id=$1',[other.rows[0].id]);
 }finally{for(const key of Object.keys(old)){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key]}
  if(roundIds.length){await db.query('DELETE FROM round_countdown_line_outbox WHERE round_id=ANY($1::bigint[])',[roundIds]);await db.query('ALTER TABLE round_audit_logs DISABLE TRIGGER USER');try{await db.query('DELETE FROM round_audit_logs WHERE round_id=ANY($1::bigint[])',[roundIds])}finally{await db.query('ALTER TABLE round_audit_logs ENABLE TRIGGER USER')}await db.query('DELETE FROM rounds WHERE id=ANY($1::bigint[])',[roundIds])}if(memberId){await db.query('DELETE FROM member_countdown_line_preferences WHERE member_id=$1',[memberId]);await db.query('DELETE FROM member_identities WHERE member_id=$1',[memberId]);await db.query('DELETE FROM members WHERE id=$1',[memberId])}if(oaId)await db.query('DELETE FROM oa_service_control WHERE id=$1',[oaId]);await db.end()}
});
