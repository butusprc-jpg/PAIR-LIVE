import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {database} from '../lib/server/db';
import {RoundError} from '../lib/rounds/core';
import {currentRound,roundRuleSettings,submitDemoEntry,tickRoundEngine,updateRoundRule} from '../lib/rounds/store';

test('entry limits and last-minute alert persist and apply only to the next round',{skip:!process.env.DATABASE_URL||process.env.PAIR_ROUND_RULES_TEST_ISOLATED!=='1'},async()=>{
 const {assertTestTarget}=await import('../lib/migration-manifest');assertTestTarget(process.env.DATABASE_URL);
 const db=database();
 try{
  await db.query('TRUNCATE round_audit_logs,rounds CASCADE');
  await db.query('UPDATE round_settings SET duration_minutes=5 WHERE id=1');
  const member=(await db.query("INSERT INTO members(display_name,demo_points) VALUES('Rule fixture',1250) RETURNING id")).rows[0].id;
  assert.deepEqual(await roundRuleSettings(),{minEntryPoints:1,maxEntryPoints:1000000,alertBeforeClose:true});
  const first=(await tickRoundEngine()).round!;
  await updateRoundRule('maxEntryPoints',100);
  await updateRoundRule('minEntryPoints',10);
  await updateRoundRule('alertBeforeClose',false);
  assert.deepEqual(await roundRuleSettings(),{minEntryPoints:10,maxEntryPoints:100,alertBeforeClose:false});
  assert.equal((await currentRound()).round?.alertBeforeClose,true);
  await submitDemoEntry(member,first.id,{side:'even',demoPoints:1,idempotencyKey:randomUUID()});
  await db.query("UPDATE rounds SET status='SETTLED',settled_at=clock_timestamp() WHERE id=$1",[first.id]);
  const second=(await tickRoundEngine()).round!;
  assert.equal(second.alertBeforeClose,false);
  assert.notEqual(second.id,first.id);
  for(const points of [1,101])await assert.rejects(submitDemoEntry(member,second.id,{side:'even',demoPoints:points,idempotencyKey:randomUUID()}),error=>error instanceof RoundError&&error.code==='entry_points_out_of_range');
  await submitDemoEntry(member,second.id,{side:'odd',demoPoints:10,idempotencyKey:randomUUID()});
  for(const value of [0,1000001,1.5])await assert.rejects(updateRoundRule('maxEntryPoints',value),error=>error instanceof RoundError&&error.code==='invalid_round_rule');
  await assert.rejects(updateRoundRule('alertBeforeClose',1),error=>error instanceof RoundError&&error.code==='invalid_round_rule');
  await assert.rejects(updateRoundRule('minEntryPoints',101),error=>error instanceof RoundError&&error.code==='invalid_entry_range');
  assert.deepEqual(await roundRuleSettings(),{minEntryPoints:10,maxEntryPoints:100,alertBeforeClose:false});
 }finally{await db.query('TRUNCATE round_audit_logs,rounds CASCADE');await db.end()}
});
