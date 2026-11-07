import test from 'node:test';
import assert from 'node:assert/strict';
import {remainingRoundSeconds,roundClock,serverClockOffset} from '../lib/rounds/countdown';
test('server clock drives both views and never restarts after a refresh',()=>{
 const start=Date.parse('2026-11-05T10:00:00Z'),close='2026-11-05T10:05:00Z';
 const offset=serverClockOffset('2026-11-05T10:00:00Z',start-1000,start+1000);
 assert.equal(offset,0);assert.equal(roundClock(remainingRoundSeconds(close,start,offset)),'05:00');
 assert.equal(roundClock(remainingRoundSeconds(close,start+240000,offset)),'01:00');
 assert.equal(roundClock(remainingRoundSeconds(close,start+300000,offset)),'00:00');
 assert.equal(remainingRoundSeconds(close,start+301000,offset),0);
 const refreshed=serverClockOffset('2026-11-05T10:04:30Z',start+269000,start+271000);
 assert.equal(roundClock(remainingRoundSeconds(close,start+270000,refreshed)),'00:30');
});
