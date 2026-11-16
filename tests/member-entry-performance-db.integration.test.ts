import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {Pool,type PoolClient} from 'pg';
import {assertTestTarget,migrationManifest} from '../lib/migration-manifest';
import {database} from '../lib/server/db';

const raw=process.env.MEMBER_PERF_TEST_DATABASE_URL;
function percentiles(samples:number[]){const sorted=[...samples].sort((a,b)=>a-b);return {p50:sorted[Math.ceil(sorted.length*.50)-1],p95:sorted[Math.ceil(sorted.length*.95)-1],p99:sorted[Math.ceil(sorted.length*.99)-1]}}

test('20 and 100 concurrent synthetic entries preserve wallet and ledger totals',{skip:!raw},async()=>{
 const root=new Pool({connectionString:assertTestTarget(raw)}),schema=`member_perf_${randomUUID().replaceAll('-','')}`;
 const prior=Object.fromEntries(['DATABASE_URL','PAIR_WALLET_CUTOVER_VERIFIED','CONNECTED_LINE_OA_ID','LINE_MESSAGING_CHANNEL_ACCESS_TOKEN'].map(key=>[key,process.env[key]]));
 let db:Pool|undefined;
 try{
  await root.query(`CREATE SCHEMA ${schema}`);
  const url=new URL(raw!);url.searchParams.set('options',`-csearch_path=${schema}`);db=new Pool({connectionString:url.toString()});process.env.DATABASE_URL=url.toString();process.env.PAIR_WALLET_CUTOVER_VERIFIED='true';
  for(const migration of await migrationManifest())await db.query(migration.sql);
  const oa=`@perf_${randomUUID().slice(0,8)}`,token='synthetic-perf-token';process.env.CONNECTED_LINE_OA_ID=oa;process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=token;
  await db.query("INSERT INTO oa_service_control(line_oa_id,shop_name,enabled,paused,expires_at,verified_token_hash) VALUES($1,'Synthetic Performance',true,false,now()+interval '1 day',$2)",[oa,createHash('sha256').update(token).digest('hex')]);
  await db.query("UPDATE member_wallet_runtime_state SET phase='CUTOVER_PENDING' WHERE id=1");
  await db.query("UPDATE member_wallet_runtime_state SET phase='WALLET_ACTIVE',enabled=true,ever_cutover=true,cutover_at=now() WHERE id=1");
  const {startManualRound,submitDemoEntry}=await import('../lib/rounds/store');
  const round=(await startManualRound(randomUUID())).round;
  for(const count of [20,100]){
   const members:string[]=(await db.query<{id:string}>("INSERT INTO members(display_name,demo_points) SELECT 'perf-'||g::text,1000 FROM generate_series(1,$1::int) g RETURNING id",[count])).rows.map(row=>String(row.id));
   const setup=await db.connect();try{for(const memberId of members){await setup.query("SELECT set_config('pair_live.member_id',$1,false)",[memberId]);await setup.query('INSERT INTO member_wallets(member_id,available_points) VALUES($1,1000)',[memberId])}}finally{setup.release()}
   const start=performance.now();
   const durations=await Promise.all(members.map(async memberId=>{const began=performance.now();await submitDemoEntry(memberId,round.id,{side:'even',demoPoints:10,idempotencyKey:randomUUID()});return performance.now()-began}));
   const total=performance.now()-start;
   const entryCount:number=Number((await db.query<{even_people:number}>('SELECT even_people FROM rounds WHERE id=$1',[round.id])).rows[0].even_people);
   assert.equal(entryCount,count===20?20:120);
   const check:PoolClient=await db.connect();try{for(const memberId of members){await check.query("SELECT set_config('pair_live.member_id',$1,false)",[memberId]);assert.equal(Number((await check.query<{available_points:string}>('SELECT available_points FROM member_wallets WHERE member_id=$1',[memberId])).rows[0].available_points),990);assert.equal((await check.query<{n:number}>("SELECT count(*)::int AS n FROM member_wallet_ledger WHERE member_id=$1 AND type='DEMO_USE'",[memberId])).rows[0].n,1);assert.equal((await check.query<{n:number}>('SELECT count(*)::int AS n FROM round_entries WHERE round_id=$1 AND member_id=$2',[round.id,memberId])).rows[0].n,1)}}finally{check.release()}
   const p=percentiles(durations);console.log(`member_entry_perf count=${count} total_ms=${total.toFixed(1)} p50_ms=${p.p50.toFixed(1)} p95_ms=${p.p95.toFixed(1)} p99_ms=${p.p99.toFixed(1)}`);
  }
 }finally{
  if(process.env.DATABASE_URL?.includes(schema))await database().end().catch(()=>{});
  for(const [key,value] of Object.entries(prior)){if(value===undefined)delete process.env[key];else process.env[key]=value}
  await db?.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(()=>{});await root.end();
 }
});
