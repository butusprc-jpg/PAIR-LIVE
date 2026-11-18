import test from 'node:test';
import assert from 'node:assert/strict';
import {memberLogoutResponse} from '../lib/server/member-logout';

const cookie='pair_member_session';

test('logout revokes before reporting success and clears the cookie',async()=>{
 let revoked=false;
 const response=await memberLogoutResponse('session-token',cookie,async token=>{assert.equal(token,'session-token');revoked=true});
 assert.equal(revoked,true);
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{ok:true});
 assert.match(response.headers.get('set-cookie')||'',/pair_member_session=;/);
 assert.equal(response.headers.get('Cache-Control'),'no-store');
});

test('database revocation failure keeps browser cookie and reports an error',async()=>{
 const response=await memberLogoutResponse('session-token',cookie,async()=>{throw Error('database unavailable')});
 assert.equal(response.status,503);
 assert.deepEqual(await response.json(),{ok:false,error:'session_revoke_failed'});
 assert.equal(response.headers.get('set-cookie'),null);
});

test('logout replay is safe after revocation or cookie removal',async()=>{
 const sessions=new Set(['session-token']);
 const revoke=async(token:string)=>{sessions.delete(token)};
 const first=await memberLogoutResponse('session-token',cookie,revoke);
 const replay=await memberLogoutResponse('session-token',cookie,revoke);
 const withoutCookie=await memberLogoutResponse(undefined,cookie,revoke);
 assert.equal(first.status,200);assert.equal(replay.status,200);assert.equal(withoutCookie.status,200);
 assert.equal(sessions.size,0);
});
