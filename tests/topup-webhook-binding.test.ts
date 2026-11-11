import test from 'node:test';
import assert from 'node:assert/strict';
import {requireMatchingStagingWebhook} from '../lib/topup/webhook-binding';

test('staging refuses requests whose LINE postbacks reach another webhook',async()=>{
 const original={id:process.env.RAILWAY_ENVIRONMENT_ID,domain:process.env.RAILWAY_PUBLIC_DOMAIN,token:process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN};
 try{
  process.env.RAILWAY_ENVIRONMENT_ID='1eae6433-f3f1-474c-b1c6-aed7632ccdbf';
  process.env.RAILWAY_PUBLIC_DOMAIN='test-staging.example';
  process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN='synthetic-ci-token';
  const matching:typeof fetch=async()=>Response.json({active:true,endpoint:'https://test-staging.example/api/line/webhook'});
  const mismatched:typeof fetch=async()=>Response.json({active:true,endpoint:'https://other.example/api/line/webhook'});
  await requireMatchingStagingWebhook(matching);
  await assert.rejects(requireMatchingStagingWebhook(mismatched),/line_webhook_staging_mismatch/);
  await assert.rejects(requireMatchingStagingWebhook(async()=>new Response('',{status:503})),/line_webhook_check_unavailable/);
  delete process.env.RAILWAY_ENVIRONMENT_ID;
  await requireMatchingStagingWebhook(async()=>{throw Error('production must not check staging binding')});
 }finally{
  for(const [key,value] of Object.entries({RAILWAY_ENVIRONMENT_ID:original.id,RAILWAY_PUBLIC_DOMAIN:original.domain,LINE_MESSAGING_CHANNEL_ACCESS_TOKEN:original.token})){
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
 }
});
