import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from '../lib/server/db';
import {startRoundForLive,updateRoundSettings,tickRoundEngine} from '../lib/rounds/store';
import {dispatchClosingBroadcast} from '../lib/line/round-broadcast';
test('live activation is idempotent and one-minute broadcast is durable once per PostgreSQL round',{skip:!process.env.DATABASE_URL||process.env.PAIR_LIVE_BROADCAST_TEST_ISOLATED!=='1'},async()=>{
 const {assertTestTarget}=await import('../lib/migration-manifest');assertTestTarget(process.env.DATABASE_URL);const db=database();
 try{await db.query('TRUNCATE round_line_broadcast_outbox,round_audit_logs,rounds CASCADE');await updateRoundSettings(1,'manual');
  const actor='00000000-0000-4000-8000-000000000001',key='00000000-0000-4000-8000-000000000002';
  assert.equal((await tickRoundEngine({requireLiveForAuto:true})).round,null);
  const results=await Promise.all([startRoundForLive(actor,key),startRoundForLive(actor,key)]);assert.equal(results[0].round!.id,results[1].round!.id);assert.deepEqual(results.map(x=>x.replayed).sort(),[false,true]);
  const reconnect=await startRoundForLive(actor,'00000000-0000-4000-8000-000000000003');assert.equal(reconnect.round!.id,results[0].round!.id);assert.equal(reconnect.replayed,true);
  const round=results[0].round!;assert.equal(round.durationMinutes,1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM round_line_broadcast_outbox WHERE round_id=$1',[round.id])).rows[0].n,1);
  let sent=0;const fetcher=(async(input:RequestInfo|URL)=>{const url=String(input);if(url.endsWith('/quota'))return Response.json({type:'limited',value:100});if(url.endsWith('/consumption'))return Response.json({totalUsage:1});sent++;return new Response('',{status:200})}) as typeof fetch;
  const dispatched=await Promise.all([dispatchClosingBroadcast(db,'test-token',fetcher),dispatchClosingBroadcast(db,'test-token',fetcher)]);assert.equal(dispatched.filter(Boolean).length,1);assert.equal(sent,1);
  assert.equal((await db.query('SELECT status,attempts FROM round_line_broadcast_outbox WHERE round_id=$1',[round.id])).rows[0].status,'SENT');
  await tickRoundEngine();assert.equal((await db.query('SELECT count(*)::int AS n FROM round_line_broadcast_outbox WHERE round_id=$1',[round.id])).rows[0].n,1);
  await db.query("UPDATE rounds SET status='SETTLED',settled_at=clock_timestamp() WHERE id=$1",[round.id]);
  const next=(await startRoundForLive(actor,'00000000-0000-4000-8000-000000000004')).round!;
  const retryKey=(await db.query('SELECT retry_key FROM round_line_broadcast_outbox WHERE round_id=$1',[next.id])).rows[0].retry_key;
  const rateLimited=fakeDelivery(429);assert.equal((await dispatchClosingBroadcast(db,'test-token',rateLimited))?.status,'FAILED');
  await db.query("UPDATE round_line_broadcast_outbox SET next_attempt_at=clock_timestamp() WHERE round_id=$1",[next.id]);
  const timeout=fakeDelivery(0);assert.equal((await dispatchClosingBroadcast(db,'test-token',timeout))?.status,'UNKNOWN');
  await db.query("UPDATE round_line_broadcast_outbox SET next_attempt_at=clock_timestamp() WHERE round_id=$1",[next.id]);
  assert.equal((await dispatchClosingBroadcast(db,'test-token',fetcher))?.status,'SENT');
  const final=(await db.query('SELECT status,attempts,retry_key FROM round_line_broadcast_outbox WHERE round_id=$1',[next.id])).rows[0];assert.equal(final.status,'SENT');assert.equal(final.attempts,3);assert.equal(final.retry_key,retryKey);
 }finally{await db.query('TRUNCATE round_line_broadcast_outbox,round_audit_logs,rounds CASCADE');await updateRoundSettings(5,'auto');await db.end()}
});
function fakeDelivery(status:number){return (async(input:RequestInfo|URL)=>{const url=String(input);if(url.endsWith('/quota'))return Response.json({type:'limited',value:100});if(url.endsWith('/consumption'))return Response.json({totalUsage:1});if(status===0)throw new Error('timeout');return new Response('',{status})}) as typeof fetch}
