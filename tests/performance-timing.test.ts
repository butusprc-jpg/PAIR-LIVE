import test from 'node:test';
import assert from 'node:assert/strict';
import {RequestTiming} from '../lib/server/performance-timing';
import {recordClientTiming} from '../lib/client/performance-timing';

test('performance timing exposes only fixed phase names and numeric durations',async()=>{
 const timing=new RequestTiming();
 assert.equal(await timing.measure('db_connect',async()=>42),42);
 assert.match(timing.header(),/^db_connect;dur=\d+\.\d$/);
 assert.throws(()=>timing.add('token=private',1),/invalid_performance_phase/);
 assert.doesNotMatch(timing.header(),/token|cookie|member/);
 const start=performance.now();recordClientTiming('member.session',start);
 assert.ok(performance.getEntriesByName('pair.member.session','measure').length>0);
 performance.clearMeasures('pair.member.session');
});
