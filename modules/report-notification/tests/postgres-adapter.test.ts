import test from 'node:test';
import assert from 'node:assert/strict';
import type {Pool} from 'pg';
import {createPostgresNotificationStore,createPostgresReportReader} from '../server/postgres';

const roundRow={id:'7',opens_at:new Date('2026-11-02T18:00:00Z'),closes_at:new Date('2026-11-02T18:05:00Z'),duration_minutes:5,status:'SETTLED',settled_at:new Date('2026-11-02T18:06:00Z'),result_number:'120'};
test('report reader derives a Thailand day in SQL and does not invent camera evidence',async()=>{
 const seen:{sql:string;args:unknown[]}[]=[];
 const pool={query:async(sql:string,args:unknown[])=>{seen.push({sql,args});return {rows:[roundRow]}}} as unknown as Pool;
 const rows=await createPostgresReportReader(pool).listRoundsForBangkokDate('2026-11-03');
 assert.equal(seen[0].args[0],'2026-11-03');assert.match(seen[0].sql,/AT TIME ZONE 'Asia\/Bangkok'/);
 assert.equal(rows[0].resultNumber,'120');assert.equal(rows[0].evidenceStatus,'NOT_AVAILABLE');
});
test('report reader gets distinct member identities from entry rows, never rounds.people',async()=>{
 const seen:{sql:string;args:unknown[]}[]=[];
 const pool={query:async(sql:string,args:unknown[])=>{seen.push({sql,args});return {rows:[{round_id:'7',member_id:'one',side:'even',demo_points:10,status:'PENDING'},{round_id:'7',member_id:'one',side:'even',demo_points:20,status:'PENDING'}]}}} as unknown as Pool;
 const entries=await createPostgresReportReader(pool).getEntries(['7']);
 assert.equal(entries.length,2);assert.equal(entries[0].memberId,entries[1].memberId);
 assert.match(seen[0].sql,/FROM round_entries/);assert.doesNotMatch(seen[0].sql,/even_people|odd_people/);
 assert.deepEqual(seen[0].args,[['7']]);
});
test('unsettled round hides any raw result number',async()=>{
 const pool={query:async()=>({rows:[{...roundRow,status:'CLOSED'}]})} as unknown as Pool;
 assert.equal((await createPostgresReportReader(pool).getRound('7'))?.resultNumber,null);
});
test('outbox register and enqueue use independent conflict-safe keys',async()=>{
 const calls:string[]=[];
 const pool={query:async(sql:string)=>{calls.push(sql);return {rowCount:1,rows:[]}},connect:async()=>{throw Error('unused')}} as unknown as Pool;
 const store=createPostgresNotificationStore(pool);
 await store.registerEvent({eventId:'e1',type:'ROUND_CLOSED',occurredAt:'2026-11-03T00:00:00Z',source:'core',roundId:'7',payload:{}});
 await store.enqueue({id:'d1',eventId:'e1',idempotencyKey:'key',channel:'line',recipientId:'r1',address:'U123',status:'PENDING',attempts:0,nextAttemptAt:'2026-11-03T00:00:00Z',createdAt:'2026-11-03T00:00:00Z',sentAt:null,leaseOwner:null,leaseUntil:null,lastErrorCode:null,event:{eventId:'e1',type:'ROUND_CLOSED',occurredAt:'2026-11-03T00:00:00Z',source:'core',roundId:'7',payload:{}}});
 assert.match(calls[0],/ON CONFLICT\(event_id\) DO NOTHING/);assert.match(calls[1],/ON CONFLICT DO NOTHING/);
});
test('multiworker claim uses one atomic SKIP LOCKED statement and reclaims leases',async()=>{
 let sql='';const pool={query:async(statement:string)=>{sql=statement;return {rows:[]}},connect:async()=>{throw Error('unused')}} as unknown as Pool;
 const result=await createPostgresNotificationStore(pool).claim('2026-11-03T00:00:00Z','worker-1',30000,10);
 assert.deepEqual(result,[]);assert.match(sql,/FOR UPDATE SKIP LOCKED/);assert.match(sql,/lease_until<=/);assert.match(sql,/UPDATE report_notification_outbox/);
});
test('completion uses lease-owner compare-and-set and records provider acceptance separately',async()=>{
 const calls:string[]=[];
 const client={query:async(sql:string)=>{calls.push(sql);return sql.startsWith('UPDATE')?{rowCount:1,rows:[{event_id:'e1',channel:'email'}]}:{rowCount:1,rows:[]}},release(){}};
 const pool={query:async()=>({rows:[]}),connect:async()=>client} as unknown as Pool;
 const result=await createPostgresNotificationStore(pool).complete('d1','worker-1',{status:'SENT',attempts:1,nextAttemptAt:'2026-11-03T00:00:00Z',sentAt:'2026-11-03T00:00:01Z',lastErrorCode:null});
 assert.equal(result,true);assert.ok(calls.some(s=>/lease_owner=\$2/.test(s)));assert.ok(calls.some(s=>/provider_accepted_at/.test(s)));assert.ok(calls.some(s=>/INSERT INTO report_notification_delivery_logs/.test(s)));
});
test('provider error details are reduced to safe codes before storing or logging',async()=>{
 const argumentsSeen:unknown[][]=[];
 const client={query:async(sql:string,args?:unknown[])=>{if(args)argumentsSeen.push(args);return sql.startsWith('UPDATE')?{rowCount:1,rows:[{event_id:'e1',channel:'line'}]}:{rowCount:1,rows:[]}},release(){}};
 const pool={query:async()=>({rows:[]}),connect:async()=>client} as unknown as Pool;
 await createPostgresNotificationStore(pool).complete('d1','w1',{status:'FAILED',attempts:1,nextAttemptAt:'2026-11-03T00:00:00Z',sentAt:null,lastErrorCode:'Bearer secret-value'});
 assert.ok(!JSON.stringify(argumentsSeen).includes('secret-value'));
 assert.ok(JSON.stringify(argumentsSeen).includes('PROVIDER_ERROR'));
});
