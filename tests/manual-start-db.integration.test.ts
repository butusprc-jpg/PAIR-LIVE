import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from '../lib/server/db';
import {currentRound,startManualRound,tickRoundEngine,updateRoundSettings} from '../lib/rounds/store';

test('manual start creates one PostgreSQL round from server time and preserves Auto mode', {skip:!process.env.DATABASE_URL||process.env.PAIR_MANUAL_START_TEST_ISOLATED!=='1'}, async()=>{
 const {assertTestTarget}=await import('../lib/migration-manifest');assertTestTarget(process.env.DATABASE_URL);
 const db=database();
 try{
  await db.query('TRUNCATE round_audit_logs,rounds CASCADE');
  await updateRoundSettings(7,'manual');
  assert.equal((await tickRoundEngine()).round,null);
  const admin='00000000-0000-4000-8000-000000000001';
  const results=await Promise.allSettled(Array.from({length:2},()=>startManualRound(admin)));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.filter(x=>x.status==='rejected').length,1);
  const round=(results.find(x=>x.status==='fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof startManualRound>>>).value.round;
  assert.equal(round.status,'OPEN');assert.equal(round.durationMinutes,7);
  assert.equal(Date.parse(round.closesAt)-Date.parse(round.opensAt),7*60_000);
  assert.ok(Math.abs(Date.parse(round.opensAt)-Date.parse(new Date().toISOString()))<10_000);
  assert.equal((await currentRound()).round?.id,round.id);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM rounds")).rows[0].n,1);
  const audit=await db.query("SELECT actor,details FROM round_audit_logs WHERE round_id=$1 AND action='ROUND_OPENED'",[round.id]);
  assert.equal(audit.rows.length,1);assert.equal(audit.rows[0].actor,admin);assert.equal(audit.rows[0].details.mode,'manual');
  await db.query("UPDATE rounds SET status='SCANNING',closed_at=clock_timestamp() WHERE id=$1",[round.id]);
  await assert.rejects(startManualRound(admin),/round_already_active/);
  await db.query("UPDATE rounds SET status='SETTLED',settled_at=clock_timestamp() WHERE id=$1",[round.id]);
  await updateRoundSettings(5,'auto');
  await assert.rejects(startManualRound(admin),/manual_mode_required/);
  const auto=(await tickRoundEngine()).round!;assert.equal(auto.status,'OPEN');assert.equal(auto.durationMinutes,5);
 }finally{await db.query('TRUNCATE round_audit_logs,rounds CASCADE');await updateRoundSettings(5,'auto');await db.end()}
});
