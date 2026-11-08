import test from 'node:test';import assert from 'node:assert/strict';
import {clearLineUsageCache,fetchLineUsage,connectedToken} from '../lib/owner/usage-line';
import {allowUsageRead} from '../lib/owner/usage-rate';
import {createHash} from 'node:crypto';
test('LINE quota is cached per verified OA and failures never become zero',async()=>{
 clearLineUsageCache();let calls=0;const token='synthetic-token',oa='oa-test';
 const fake=async(url:string)=>{calls++;return Response.json(url.endsWith('/consumption')?{totalUsage:70}:{type:'limited',value:100})};
 const a=await fetchLineUsage(oa,token,fake as typeof fetch,1000);const b=await fetchLineUsage(oa,token,fake as typeof fetch,2000);
 assert.equal(a.status,'OK');assert.equal(a.used,70);assert.equal(a.quota,100);assert.deepEqual(b,a);assert.equal(calls,2);
 const e=await fetchLineUsage('other',token,async()=>new Response('',{status:401}),1000);assert.equal(e.status,'ERROR');assert.equal(e.used,null);assert.equal(e.quota,null);assert.equal(e.errorCode,'UNAUTHORIZED');
 const none=await fetchLineUsage('unbound',null,fake as typeof fetch);assert.equal(none.status,'NOT_CONNECTED');assert.equal(none.used,null);
});
test('token is usable only for its verified connected OA',()=>{
 const oldId=process.env.CONNECTED_LINE_OA_ID,oldToken=process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
 try{process.env.CONNECTED_LINE_OA_ID='@test';process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN='synthetic-token';const hash=createHash('sha256').update('synthetic-token').digest('hex');assert.equal(connectedToken({line_oa_id:'@test',verified_token_hash:hash}),'synthetic-token');assert.equal(connectedToken({line_oa_id:'@other',verified_token_hash:hash}),null);assert.equal(connectedToken({line_oa_id:'@test',verified_token_hash:'bad'}),null)}finally{if(oldId===undefined)delete process.env.CONNECTED_LINE_OA_ID;else process.env.CONNECTED_LINE_OA_ID=oldId;if(oldToken===undefined)delete process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;else process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=oldToken}
});
test('owner usage reads are locally rate limited by authenticated session',()=>{for(let i=0;i<20;i++)assert.equal(allowUsageRead('synthetic-session',1000),true);assert.equal(allowUsageRead('synthetic-session',1000),false);assert.equal(allowUsageRead('synthetic-session',62000),true)});
