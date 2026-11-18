import test from 'node:test';
import assert from 'node:assert/strict';
import {issueSession,resolveSession} from '../lib/server/member-session-store';

const scopeA={provider:'line' as const,channelId:'line-oa-a'};
const scopeB={provider:'line' as const,channelId:'line-oa-b'};

test('member session is valid only for its verified provider and server channel',async()=>{
 let saved='';let reads=0;
 const db={async query(sql:string,params:unknown[]=[]){
  if(sql.startsWith('INSERT INTO member_sessions')){saved=String(params[0]);return {rows:[],rowCount:1}}
  reads++;
  assert.equal(params[0],saved);assert.deepEqual(params.slice(1),['line','line-oa-a']);
  return {rows:[{id:'member-a',status:'active',provider:'line',provider_channel_id:'line-oa-a'}],rowCount:1};
 }};
 const token=await issueSession(db as never,'member-a',scopeA);
 assert.equal((await resolveSession(db as never,token,[scopeA]))?.id,'member-a');
 assert.equal(await resolveSession(db as never,token,[scopeB]),null);
 assert.equal(await resolveSession(db as never,token,[]),null);
 assert.equal(await resolveSession(db as never,'legacy-token',[scopeA]),null);
 assert.equal(reads,1,'rejected sessions must not read member or wallet data');
});

test('a session without matching identity is rejected',async()=>{
 let saved='';const db={async query(sql:string,params:unknown[]=[]){if(sql.startsWith('INSERT INTO member_sessions')){saved=String(params[0]);return {rows:[],rowCount:1}}assert.equal(params[0],saved);return {rows:[],rowCount:0}}};
 const token=await issueSession(db as never,'member-a',scopeA);
 assert.equal(await resolveSession(db as never,token,[scopeA]),null);
});
