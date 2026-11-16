import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticCountdownDue,startAutomaticCountdown} from '../lib/rounds/automatic-countdown';
import type {PoolClient} from 'pg';

test('countdown starts at the last minute, including at round start for a one-minute round',()=>{
 const opened=new Date('2026-01-01T00:00:00Z');
 const twoMinutes=new Date(opened.getTime()+120_000);
 assert.equal(automaticCountdownDue(opened,twoMinutes,opened),false);
 assert.equal(automaticCountdownDue(opened,twoMinutes,new Date(opened.getTime()+59_999)),false);
 assert.equal(automaticCountdownDue(opened,twoMinutes,new Date(opened.getTime()+60_000)),true);
 assert.equal(automaticCountdownDue(opened,new Date(opened.getTime()+60_000),opened),true);
 assert.equal(automaticCountdownDue(opened,twoMinutes,twoMinutes),false);
});

test('locked countdown start queues notices once and keeps the configured close time',async()=>{
 const opened=new Date('2026-01-01T00:00:00Z'),closes=new Date(opened.getTime()+60_000);
 const row={id:'7',status:'OPEN',opens_at:opened,closes_at:closes,countdown_started_at:null,settlement_oa_id:'oa'};
 const queries:string[]=[];
 const client={query:async(sql:string)=>{queries.push(sql);return {rows:sql.startsWith('UPDATE rounds')? [{...row,countdown_started_at:opened,countdown_ends_at:closes}]:[]}}} as unknown as PoolClient;
 const started=await startAutomaticCountdown(client,row,opened);
 await startAutomaticCountdown(client,started,opened);
 assert.equal(queries.filter(q=>q.startsWith('UPDATE rounds')).length,1);
 assert.equal(queries.filter(q=>q.startsWith('INSERT INTO round_countdown_line_outbox')).length,1);
 assert.match(queries[0],/countdown_ends_at=closes_at/);
 assert.match(queries[2],/ON CONFLICT DO NOTHING/);
});
