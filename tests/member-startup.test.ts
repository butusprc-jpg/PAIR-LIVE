import test from 'node:test';
import assert from 'node:assert/strict';
import {memberStartup} from '../lib/client/member-startup';

test('existing member cookie opens session without runtime or LINE SDK request',async()=>{
 const calls:{url:string;init?:RequestInit}[]=[];
 const fetcher=(async(url:string,init?:RequestInit)=>{calls.push({url,init});return Response.json({member:{id:'member-1',displayName:'Synthetic',avatarUrl:null,provider:'line',demoPoints:50}})}) as typeof fetch;
 const result=await memberStartup(fetcher);
 assert.equal(result.kind,'member');assert.deepEqual(calls.map(call=>call.url),['/api/auth/session']);
 assert.equal(calls[0].init?.credentials,'same-origin');assert.equal(calls[0].init?.cache,'no-store');
});

test('only an explicit 401 requests login configuration',async()=>{
 const calls:string[]=[];
 const fetcher=(async(url:string)=>{calls.push(url);return url.endsWith('session')?Response.json({error:'not_authenticated'},{status:401}):Response.json({lineConfigured:true,wechatConfigured:false})}) as typeof fetch;
 assert.deepEqual(await memberStartup(fetcher),{kind:'login',runtime:{lineConfigured:true,wechatConfigured:false}});
 assert.deepEqual(calls,['/api/auth/session','/api/auth/runtime']);
});

test('session outage and malformed success fail closed without entering login',async()=>{
 for(const response of [Response.json({error:'database_not_configured'},{status:503}),Response.json({ok:true})]){
  let calls=0;const fetcher=(async()=>{calls++;return response}) as typeof fetch;
  await assert.rejects(memberStartup(fetcher),/member_session_unavailable/);assert.equal(calls,1);
 }
});

test('scoped login checks the selected OA session and fetches its runtime LIFF',async()=>{
 const calls:string[]=[];const key='synthetic-oa-key';
 const fetcher=(async(url:string)=>{calls.push(url);return url.includes('/session')?Response.json({error:'oa_session_mismatch'},{status:401}):Response.json({lineConfigured:true,wechatConfigured:false,liffId:'liff-B',oaKey:key})}) as typeof fetch;
 assert.deepEqual(await memberStartup(fetcher,key),{kind:'login',runtime:{lineConfigured:true,wechatConfigured:false,liffId:'liff-B',oaKey:key}});
 assert.deepEqual(calls,['/api/auth/session?oa=synthetic-oa-key','/api/auth/runtime?oa=synthetic-oa-key']);
});
