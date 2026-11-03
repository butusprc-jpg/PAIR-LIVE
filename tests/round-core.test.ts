import test from 'node:test';
import assert from 'node:assert/strict';
import {canAccept,closesAt,effectiveStatus,formatBangkok,nextStatus,remainingSeconds,validateDuration,validateEntry} from '../lib/rounds/core';
const opened='2026-11-03T10:00:00.000Z';
test('default five minute round and duration choices do not mutate an open round',()=>{
 const current={closesAt:closesAt(opened,5),status:'OPEN' as const};assert.equal(current.closesAt,'2026-11-03T10:05:00.000Z');
 for(const duration of [3,10,15])assert.equal(closesAt(opened,duration),`2026-11-03T10:${String(duration).padStart(2,'0')}:00.000Z`);
 assert.equal(current.closesAt,'2026-11-03T10:05:00.000Z');
 for(const invalid of [0,61,1.5,NaN])assert.throws(()=>validateDuration(invalid));
});
test('clients sharing server close time agree on countdown even after reconnect',()=>{
 const round={closesAt:closesAt(opened,5),status:'OPEN' as const};
 for(const client of [1,2])assert.equal(remainingSeconds(round,'2026-11-03T10:04:00.000Z'),60);
 assert.equal(remainingSeconds(round,'2026-11-03T10:05:00.000Z'),0);
 assert.equal(canAccept(round,'2026-11-03T10:04:59.999Z'),true);
 assert.equal(canAccept(round,'2026-11-03T10:05:00.000Z'),false);
 assert.equal(effectiveStatus(round,'2026-11-03T10:05:00.000Z'),'CLOSED');
});
test('worker transitions are idempotent and never invent a result',()=>{
 assert.equal(nextStatus('OPEN',true),'CLOSED');assert.equal(nextStatus('CLOSED',true),'SCANNING');
 assert.equal(nextStatus('SCANNING',true),'SCANNING');assert.equal(nextStatus('REVIEW_REQUIRED',true),'REVIEW_REQUIRED');
});
test('entry validates side, points and idempotency key',()=>{
 const idempotencyKey='aababbcc-11aa-4111-8111-aaaaaaaaaaaa';
 validateEntry({side:'even',demoPoints:50,idempotencyKey});
 assert.throws(()=>validateEntry({side:'bad' as 'even',demoPoints:50,idempotencyKey}));
 assert.throws(()=>validateEntry({side:'even',demoPoints:0,idempotencyKey}));
 assert.throws(()=>validateEntry({side:'even',demoPoints:50,idempotencyKey:'not-a-uuid'}));
});
test('timestamps display in Bangkok while source stays UTC',()=>{assert.match(formatBangkok('2026-11-03T10:00:00.000Z'),/17:00/)});
