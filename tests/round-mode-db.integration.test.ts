import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from '../lib/server/db';
import {currentRound,roundSettings,tickRoundEngine,updateDurationForNextRound,updateRoundSettings} from '../lib/rounds/store';

test('Manual and Auto settings persist and only govern creation of the next round', {skip:!process.env.DATABASE_URL||process.env.PAIR_ROUND_MODE_TEST_ISOLATED!=='1'}, async()=>{
 const {assertTestTarget}=await import('../lib/migration-manifest');assertTestTarget(process.env.DATABASE_URL);
 const db=database();
 try{
  await db.query('TRUNCATE round_audit_logs,rounds CASCADE');
  await db.query('UPDATE round_settings SET duration_minutes=5 WHERE id=1');
  assert.deepEqual((await roundSettings()).mode,'auto');
  const first=(await tickRoundEngine()).round!;
  assert.equal(first.status,'OPEN');
  await updateRoundSettings(7,'manual');
  assert.deepEqual({durationMinutes:(await roundSettings()).durationMinutes,mode:(await roundSettings()).mode},{durationMinutes:7,mode:'manual'});
  await updateDurationForNextRound(8);
  assert.equal((await roundSettings()).mode,'manual');
  assert.equal((await currentRound()).round?.closesAt,first.closesAt);
  assert.equal((await tickRoundEngine()).round?.id,first.id);
  await db.query("UPDATE rounds SET status='SETTLED',settled_at=clock_timestamp() WHERE id=$1",[first.id]);
  assert.equal((await tickRoundEngine()).round,null);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM rounds')).rows[0].count,1);
  await updateRoundSettings(9,'auto');
  assert.equal((await roundSettings()).mode,'auto');
  const second=(await tickRoundEngine()).round!;
  assert.equal(second.status,'OPEN');
  assert.equal(second.durationMinutes,9);
  assert.notEqual(second.id,first.id);
 }finally{await db.query('TRUNCATE round_audit_logs,rounds CASCADE');await db.query('UPDATE round_settings SET duration_minutes=5 WHERE id=1');await db.end()}
});
