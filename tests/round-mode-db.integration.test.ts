import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from '../lib/server/db';
import {roundSettings,tickRoundEngine,updateRoundSettings,startManualRound,startRoundForLive} from '../lib/rounds/store';
test('legacy auto setting cannot start rounds; only manual command can', {skip:!process.env.DATABASE_URL||process.env.PAIR_ROUND_MODE_TEST_ISOLATED!=='1'},async()=>{
 const {assertTestTarget}=await import('../lib/migration-manifest');assertTestTarget(process.env.DATABASE_URL);
 const db=database();try{
  await db.query('TRUNCATE round_audit_logs,rounds CASCADE');
  await db.query("INSERT INTO round_audit_logs(actor,action,details) VALUES('legacy','ROUND_MODE_CHANGED','{\"to\":\"auto\"}'::jsonb)");
  assert.equal((await roundSettings()).mode,'manual');
  assert.equal((await tickRoundEngine()).round,null);
  assert.equal((await tickRoundEngine({requireLiveForAuto:true})).round,null);
  await assert.rejects(updateRoundSettings(5,'auto'),/invalid_round_mode/);
  await assert.rejects(startRoundForLive('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'),/use_manual_round_start/);
  const started=await startManualRound('00000000-0000-4000-8000-000000000001');assert.equal(started.round.status,'OPEN');
  assert.equal((await tickRoundEngine()).round?.id,started.round.id);
 }finally{await db.query('TRUNCATE round_audit_logs,rounds CASCADE');await db.end()}
});
