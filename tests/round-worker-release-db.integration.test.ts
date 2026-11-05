import test from 'node:test';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {database} from '../lib/server/db';
import {enqueueClosingBroadcast,dispatchClosingBroadcast} from '../lib/line/round-broadcast';
import {startRoundForLive,tickRoundEngine,updateRoundSettings} from '../lib/rounds/store';

const enabled=!!process.env.DATABASE_URL&&process.env.PAIR_WORKER_RELEASE_TEST_ISOLATED==='1';
const actor='00000000-0000-4000-8000-000000000001';
const key='00000000-0000-4000-8000-000000000011';

test('worker queues a five-minute round at 60 seconds, resumes after restart and never starts another round',{skip:!enabled},async()=>{
 const {assertTestTarget}=await import('../lib/migration-manifest');
 const url=assertTestTarget(process.env.DATABASE_URL);
 const db=database();
 const fetcher=(async(input:RequestInfo|URL)=>{
  const path=String(input);
  if(path.endsWith('/quota'))return Response.json({type:'limited',value:100});
  if(path.endsWith('/consumption'))return Response.json({totalUsage:1});
  return new Response('',{status:200});
 }) as typeof fetch;
 try{
  await db.query('TRUNCATE round_line_broadcast_outbox,round_audit_logs,rounds CASCADE');
  await updateRoundSettings(5,'auto');
  assert.equal((await tickRoundEngine({allowAutoStart:false})).round,null);
  const round=(await startRoundForLive(actor,key)).round!;
  assert.equal(round.durationMinutes,5);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM round_line_broadcast_outbox')).rows[0].n,0);
  await db.query("UPDATE rounds SET opens_at=opens_at-interval '239 seconds',closes_at=closes_at-interval '239 seconds' WHERE id=$1",[round.id]);
  await tickRoundEngine({allowAutoStart:false});
  assert.equal((await db.query('SELECT count(*)::int AS n FROM round_line_broadcast_outbox')).rows[0].n,0);
  await db.query("UPDATE rounds SET opens_at=opens_at-interval '2 seconds',closes_at=closes_at-interval '2 seconds' WHERE id=$1",[round.id]);
  await Promise.all([tickRoundEngine({allowAutoStart:false}),tickRoundEngine({allowAutoStart:false})]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM round_line_broadcast_outbox')).rows[0].n,1);

  const client=await db.connect();
  try{
   await client.query('BEGIN');
   await client.query('DELETE FROM round_line_broadcast_outbox WHERE round_id=$1',[round.id]);
   assert.equal(await enqueueClosingBroadcast(client,{id:round.id,status:'OPEN',closesAt:new Date(Date.now()+30_000).toISOString()},new Date().toISOString()),true);
   await client.query('ROLLBACK');
  }finally{client.release()}
  assert.equal((await db.query('SELECT count(*)::int AS n FROM round_line_broadcast_outbox')).rows[0].n,1);

  await db.query("UPDATE round_line_broadcast_outbox SET status='SENDING',attempts=1,lease_until=clock_timestamp()-interval '1 second',next_attempt_at=clock_timestamp() WHERE round_id=$1",[round.id]);
  const restarted=new Pool({connectionString:url,ssl:false,max:2});
  try{
   const result=await dispatchClosingBroadcast(restarted,'test-token',fetcher);
   assert.equal(result?.status,'SENT');
  }finally{await restarted.end()}
  assert.equal((await db.query('SELECT status,attempts FROM round_line_broadcast_outbox WHERE round_id=$1',[round.id])).rows[0].attempts,2);
  assert.equal((await db.query('SELECT status FROM round_line_broadcast_outbox WHERE round_id=$1',[round.id])).rows[0].status,'SENT');
  await db.query("UPDATE rounds SET status='SETTLED',settled_at=clock_timestamp() WHERE id=$1",[round.id]);
  assert.equal((await tickRoundEngine({allowAutoStart:false})).round,null);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM rounds')).rows[0].n,1);

  const finished=(await startRoundForLive(actor,'00000000-0000-4000-8000-000000000013')).round!;
  await db.query("UPDATE rounds SET opens_at=opens_at-interval '241 seconds',closes_at=closes_at-interval '241 seconds' WHERE id=$1",[finished.id]);
  await tickRoundEngine({allowAutoStart:false});
  await db.query("UPDATE rounds SET status='SETTLED',settled_at=clock_timestamp() WHERE id=$1",[finished.id]);
  let latePost=0;
  const noLatePost=(async(input:RequestInfo|URL)=>{if(String(input).endsWith('/broadcast'))latePost++;return new Response('',{status:200})}) as typeof fetch;
  assert.equal((await dispatchClosingBroadcast(db,'test-token',noLatePost))?.errorCode,'round_not_open');
  assert.equal(latePost,0);

  const expired=(await startRoundForLive(actor,'00000000-0000-4000-8000-000000000012')).round!;
  await db.query("UPDATE rounds SET opens_at=opens_at-interval '301 seconds',closes_at=closes_at-interval '301 seconds' WHERE id=$1",[expired.id]);
  await tickRoundEngine({allowAutoStart:false});
  assert.equal((await db.query('SELECT count(*)::int AS n FROM round_line_broadcast_outbox WHERE round_id=$1',[expired.id])).rows[0].n,0);
 }finally{
  await db.query('TRUNCATE round_line_broadcast_outbox,round_audit_logs,rounds CASCADE');
  await updateRoundSettings(5,'auto');
  await db.end();
 }
});
