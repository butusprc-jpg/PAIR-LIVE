import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldRotateSession} from '../lib/server/member-session-store';

test('short and recent remembered sessions do not write on every check; old remembered sessions still rotate',()=>{
 const now=Date.parse('2026-11-16T00:00:00Z');
 assert.equal(shouldRotateSession({remember_session:false,rotated_at:new Date(now-48*60*60*1000)},now),false);
 assert.equal(shouldRotateSession({remember_session:true,rotated_at:new Date(now-60_000)},now),false);
 assert.equal(shouldRotateSession({remember_session:true,rotated_at:new Date(now-24*60*60*1000-1)},now),true);
});
