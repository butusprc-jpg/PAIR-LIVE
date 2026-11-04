import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {database} from '../lib/server/db';
import {currentRound,myRoundEntries,roundTotals,submitDemoEntry,tickRoundEngine,updateDurationForNextRound} from '../lib/rounds/store';
import {RoundError} from '../lib/rounds/core';
test('PostgreSQL round lifecycle, idempotency, ownership, restart and no result generation', {skip:!process.env.DATABASE_URL||process.env.PAIR_ROUND_TEST_ISOLATED!=='1'}, async()=>{
 const {assertTestTarget}=await import('../lib/migration-manifest'); assertTestTarget(process.env.DATABASE_URL);
 const db=database();
 const a=(await db.query("INSERT INTO members(display_name) VALUES('Test A') RETURNING id")).rows[0].id as string;
 const b=(await db.query("INSERT INTO members(display_name) VALUES('Test B') RETURNING id")).rows[0].id as string;
 let roundId:string|undefined;
 try{
  const initial=await tickRoundEngine();assert.equal(initial.round?.status,'OPEN');assert.equal(initial.round?.durationMinutes,5);
  roundId=initial.round!.id;
  assert.equal(new Date(initial.round!.closesAt).getTime()-new Date(initial.round!.opensAt).getTime(),300000);
  assert.equal((await tickRoundEngine()).round?.id,roundId);
  for(const duration of [3,10,15]){await updateDurationForNextRound(duration);assert.equal((await currentRound()).round?.closesAt,initial.round!.closesAt)}
  const key=randomUUID(),payload={side:'even' as const,demoPoints:50,idempotencyKey:key};
  const [first,replay]=await Promise.all([submitDemoEntry(a,roundId,payload),submitDemoEntry(a,roundId,payload)]);
  assert.equal(first.id,replay.id);assert.notEqual(first.replayed,replay.replayed);
  assert.equal((await roundTotals(roundId)).even.people,1);
  assert.equal((await db.query('SELECT demo_points FROM members WHERE id=$1',[a])).rows[0].demo_points,1200);
  await assert.rejects(submitDemoEntry(a,roundId,{...payload,demoPoints:100}),error=>error instanceof RoundError&&error.code==='idempotency_conflict');
  assert.equal((await myRoundEntries(a)).length,1);assert.equal((await myRoundEntries(b)).length,0);
  const client=await db.connect();try{await client.query('BEGIN');await client.query("SELECT set_config('pair_live.member_id',$1,true)",[b]);const unauthorized=await client.query('SELECT id FROM round_entries WHERE member_id=$1',[a]);assert.equal(unauthorized.rowCount,0);await client.query('ROLLBACK')}finally{client.release()}
  await db.query("UPDATE rounds SET opens_at=opens_at-interval '10 minutes',closes_at=closes_at-interval '10 minutes' WHERE id=$1",[roundId]);
  await assert.rejects(submitDemoEntry(a,roundId,{...payload,idempotencyKey:randomUUID()}),error=>error instanceof RoundError&&error.code==='round_closed');
  assert.equal((await currentRound()).round?.status,'CLOSED');
  assert.equal((await tickRoundEngine()).round?.status,'SCANNING');
  const resumed=await tickRoundEngine();assert.equal(resumed.round?.id,roundId);assert.equal(resumed.round?.status,'SCANNING');assert.equal(resumed.round?.resultNumber,null);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM rounds')).rows[0].n,1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM round_audit_logs WHERE action='ROUND_OPENED'")).rows[0].n,1);
 }finally{await db.end()}
});
