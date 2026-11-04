import test from 'node:test';
import assert from 'node:assert/strict';
import {identityKey,tokenHash,verifyLineAccessToken} from '../lib/auth-core';
function response(body:unknown,status=200){return new Response(JSON.stringify(body),{status})}
test('provider and channel are part of the identity key',()=>{
 const line={provider:'line' as const,providerChannelId:'channel-a',providerUserId:'same-id'};
 assert.notEqual(identityKey(line),identityKey({...line,provider:'wechat'}));
 assert.notEqual(identityKey(line),identityKey({...line,providerChannelId:'channel-b'}));
 assert.equal(identityKey(line),identityKey({...line}));
});
test('session hashes do not expose raw token',()=>{assert.notEqual(tokenHash('secret-token'),'secret-token');assert.equal(tokenHash('secret-token'),tokenHash('secret-token'))});
test('valid LINE token gives verified profile and optional avatar fallback',async()=>{
 let calls=0;const request=(async()=>{calls++;return calls===1?response({client_id:'expected',expires_in:3600}):response({userId:'user-1',displayName:'Member'})}) as typeof fetch;
 const member=await verifyLineAccessToken('token','expected',request);
 assert.deepEqual(member,{provider:'line',providerChannelId:'expected',providerUserId:'user-1',displayName:'Member',avatarUrl:null});assert.equal(calls,2)
});
test('invalid, expired, or wrong-channel LINE token never fetches profile',async()=>{
 for(const [body,status] of [[{},401],[{client_id:'expected',expires_in:0},200],[{client_id:'other',expires_in:3600},200]] as const){let calls=0;const request=(async()=>{calls++;return response(body,status)}) as typeof fetch;await assert.rejects(verifyLineAccessToken('token','expected',request),/line_token_invalid/);assert.equal(calls,1)}
});
test('missing token and missing channel are rejected',async()=>{await assert.rejects(verifyLineAccessToken('','expected'),/missing_line_access_token/);await assert.rejects(verifyLineAccessToken('token',''),/line_not_configured/)})
test('LINE profile without user ID cannot establish verified identity',async()=>{let calls=0;const request=(async()=>{calls++;return calls===1?response({client_id:'expected',expires_in:3600}):response({displayName:'No ID'})}) as typeof fetch;await assert.rejects(verifyLineAccessToken('token','expected',request),/line_profile_invalid/)});
