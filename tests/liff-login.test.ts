import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldRedirectLogin} from '../lib/liff';

test('LIFF redirect is guarded during repeated initialization and after returning from LINE',()=>{
 const values=new Map<string,string>();const storage={getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>{values.set(key,value)}};
 assert.equal(shouldRedirectLogin(storage,100_000),true);
 assert.equal(shouldRedirectLogin(storage,100_001),false);
 assert.equal(values.size,1);
});
