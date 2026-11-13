import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {singleOaReady} from '../lib/server/single-oa';
import {readiness} from '../lib/server/readiness';

test('single OA readiness checks both service binding and LINE provider without exposing tokens',async()=>{
 const keys=['CONNECTED_LINE_OA_ID','LINE_MESSAGING_CHANNEL_ACCESS_TOKEN','LINE_MESSAGING_CHANNEL_SECRET','LINE_LOGIN_CHANNEL_SECRET','LINE_LOGIN_PROVIDER_ID','LINE_MESSAGING_PROVIDER_ID','LINE_LOGIN_CHANNEL_ID','LINE_MESSAGING_CHANNEL_ID','NEXT_PUBLIC_LINE_LIFF_ID','RAILWAY_SINGLE_OA_MODE'] as const;
 const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
  Object.assign(process.env,{CONNECTED_LINE_OA_ID:'@synthetic-a',LINE_MESSAGING_CHANNEL_ACCESS_TOKEN:'synthetic-token',LINE_MESSAGING_CHANNEL_SECRET:'synthetic-secret',LINE_LOGIN_CHANNEL_SECRET:'synthetic-login',LINE_LOGIN_PROVIDER_ID:'synthetic-provider',LINE_MESSAGING_PROVIDER_ID:'synthetic-provider',LINE_LOGIN_CHANNEL_ID:'12345',LINE_MESSAGING_CHANNEL_ID:'67890',NEXT_PUBLIC_LINE_LIFF_ID:'synthetic-liff',RAILWAY_SINGLE_OA_MODE:'true'});
  const row={line_oa_id:'@synthetic-a',verified_token_hash:createHash('sha256').update('synthetic-token').digest('hex'),enabled:true,paused:false,deleted_at:null,expires_at:new Date(Date.now()+60000)};
  const db=(rows:unknown[])=>({query:async(sql:string)=>({rows:sql==='SELECT 1'?[{one:1}]:rows})}) as never;
  assert.equal(await readiness(db([row])),true);
  assert.equal(await singleOaReady(db([row,{...row,line_oa_id:'@synthetic-b'}])),false);
  assert.equal(await readiness(db([{...row,line_oa_id:'@synthetic-b'}])),false);
  assert.equal(await readiness(db([{...row,verified_token_hash:'0'.repeat(64)}])),false);
  process.env.LINE_MESSAGING_PROVIDER_ID='other';assert.equal(await readiness(db([row])),false);
 }finally{for(const k of keys){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k]}}
});
