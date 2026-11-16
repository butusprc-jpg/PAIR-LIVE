import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkerLinePump} from '../lib/line/worker-pump';
import {sendClosingBroadcast} from '../lib/line/round-broadcast';

test('slow LINE delivery does not delay the next round tick or start a duplicate batch',async()=>{
 let release:()=>void=()=>{},calls=0,ticks=0;
 const slow=new Promise<void>(resolve=>{release=resolve});
 const names:string[]=[];
 const pump=createWorkerLinePump([{name:'broadcast',dispatch:async()=>{calls++;await slow;return {status:'SENT'}}},{name:'countdown',dispatch:async()=>{calls++;return null}}],item=>names.push(item.name));
 const tick=()=>{ticks++;pump.kick()};
 const started=performance.now();tick();tick();
 assert.ok(performance.now()-started<100,'round ticks must not await LINE');
 assert.equal(ticks,2);assert.equal(calls,1,'one batch remains in flight');
 release();await pump.drain();assert.equal(calls,2);assert.deepEqual(names,['broadcast','countdown']);
 tick();await pump.drain();assert.equal(calls,4,'next batch can retry outbox after the prior batch completes');
});

test('a slow LINE API response stays outside the tick while quota and retry key remain in the existing sender',async()=>{
 let release:()=>void=()=>{},posts=0,ticks=0;const slow=new Promise<void>(resolve=>{release=resolve});
 const fetcher=(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=String(input);if(url.endsWith('/quota'))return Response.json({type:'limited',value:100});if(url.endsWith('/consumption'))return Response.json({totalUsage:1});posts++;assert.equal(new Headers(init?.headers).get('X-Line-Retry-Key'),'00000000-0000-4000-8000-000000000007');await slow;return new Response('',{status:200})}) as typeof fetch;
 const job={roundId:'7',retryKey:'00000000-0000-4000-8000-000000000007',attempts:1,closesAt:new Date(Date.now()+60_000).toISOString()};
 const statuses:string[]=[];const pump=createWorkerLinePump([{name:'broadcast',dispatch:()=>sendClosingBroadcast(job,'synthetic-token',fetcher)}],metric=>statuses.push(metric.status));
 const tick=()=>{ticks++;pump.kick()};tick();tick();assert.equal(ticks,2);await new Promise(resolve=>setImmediate(resolve));assert.equal(posts,1);
 release();await pump.drain();assert.deepEqual(statuses,['SENT']);
});

test('synthetic LINE delay before and after the pump is measured separately from round processing',async()=>{
 const before:number[]=[],after:number[]=[],slow=()=>new Promise<void>(resolve=>setTimeout(resolve,40));
 const pump=createWorkerLinePump([{name:'broadcast',dispatch:async()=>{await slow();return {status:'SENT'}}}],()=>{});
 for(let index=0;index<10;index++){let start=performance.now();await slow();before.push(performance.now()-start);start=performance.now();pump.kick();after.push(performance.now()-start);await pump.drain()}
 const percentile=(samples:number[],share:number)=>[...samples].sort((a,b)=>a-b)[Math.ceil(samples.length*share)-1];
 console.log(`synthetic_line_tick before_p50_ms=${percentile(before,.5).toFixed(1)} before_p95_ms=${percentile(before,.95).toFixed(1)} after_p50_ms=${percentile(after,.5).toFixed(1)} after_p95_ms=${percentile(after,.95).toFixed(1)}`);
 assert.ok(percentile(after,.95)<percentile(before,.5));
});
