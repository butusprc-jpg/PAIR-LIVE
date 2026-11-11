import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptivePoll,pollDelay} from '../lib/client/adaptive-poll';

test('adaptive polling uses 25s active, 60s idle, and stops in background',async context=>{
 context.mock.timers.enable({apis:['setTimeout']});
 const listeners=new Map<string,Set<()=>void>>();
 const add=(name:string,fn:()=>void)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name)!.add(fn)};
 const remove=(name:string,fn:()=>void)=>listeners.get(name)?.delete(fn);
 const originalDocument=globalThis.document,originalWindow=globalThis.window;
 const fakeDocument={visibilityState:'visible',addEventListener:add,removeEventListener:remove};
 Object.defineProperty(globalThis,'document',{configurable:true,value:fakeDocument});
 Object.defineProperty(globalThis,'window',{configurable:true,value:{addEventListener:add,removeEventListener:remove}});
 let calls=0,active=false;
 try{
  const stop=adaptivePoll(async()=>{calls++;return active},{onEvent:'changed'});
  await Promise.resolve();assert.equal(calls,1);
  for(let minute=0;minute<10;minute++){context.mock.timers.tick(60_000);await Promise.resolve()}
  assert.equal(calls,11);
  active=true;listeners.get('changed')?.forEach(fn=>fn());await Promise.resolve();assert.equal(calls,12);
  for(let step=0;step<24;step++){context.mock.timers.tick(25_000);await Promise.resolve()}
  assert.equal(calls,36);
  fakeDocument.visibilityState='hidden';listeners.get('visibilitychange')?.forEach(fn=>fn());
  context.mock.timers.tick(600_000);await Promise.resolve();assert.equal(calls,36);
  fakeDocument.visibilityState='visible';listeners.get('visibilitychange')?.forEach(fn=>fn());await Promise.resolve();assert.equal(calls,37);
  stop();context.mock.timers.tick(600_000);await Promise.resolve();assert.equal(calls,37);
 }finally{Object.defineProperty(globalThis,'document',{configurable:true,value:originalDocument});Object.defineProperty(globalThis,'window',{configurable:true,value:originalWindow})}
});
test('member backup poll budget is lower than the former 3s and 4s loops',()=>{
 assert.equal(pollDelay(false),60_000);assert.equal(pollDelay(true),25_000);
 const old=1+Math.floor(600_000/3_000)+1+Math.floor(600_000/4_000);
 const idle=2*(1+Math.floor(600_000/pollDelay(false)));
 const active=2*(1+Math.floor(600_000/pollDelay(true)));
 assert.deepEqual({old,idle,active},{old:352,idle:22,active:50});
});
test('transaction wake during an in-flight poll refreshes once immediately',async()=>{
 const listeners=new Map<string,Set<()=>void>>();
 const add=(name:string,fn:()=>void)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name)!.add(fn)};
 const remove=(name:string,fn:()=>void)=>listeners.get(name)?.delete(fn);
 const oldDoc=globalThis.document,oldWindow=globalThis.window;
 Object.defineProperty(globalThis,'document',{configurable:true,value:{visibilityState:'visible',addEventListener:add,removeEventListener:remove}});
 Object.defineProperty(globalThis,'window',{configurable:true,value:{addEventListener:add,removeEventListener:remove}});
 let release:()=>void=()=>{},calls=0;
 try{
  const stop=adaptivePoll(async()=>{calls++;if(calls===1)await new Promise<void>(resolve=>{release=resolve});return false},{onEvent:'changed'});
  assert.equal(calls,1);
  listeners.get('changed')?.forEach(fn=>fn());listeners.get('changed')?.forEach(fn=>fn());assert.equal(calls,1);
  release();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,2);
  stop();
 }finally{Object.defineProperty(globalThis,'document',{configurable:true,value:oldDoc});Object.defineProperty(globalThis,'window',{configurable:true,value:oldWindow})}
});

test('LIVE polling checks active video every 5s and idle every 15s',()=>{assert.equal(pollDelay(true,true),5_000);assert.equal(pollDelay(false,true),15_000);assert.equal(pollDelay(true),25_000);assert.equal(pollDelay(false),60_000)});
