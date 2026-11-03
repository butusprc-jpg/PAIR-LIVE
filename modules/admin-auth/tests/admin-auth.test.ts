import test from 'node:test';
import assert from 'node:assert/strict';
import {createPairLiveLineProvider} from '../server/adapters';
import {lineIdentity,setup} from './helpers';

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
test('shared PAIR LIVE LINE adapter verifies token, expiry, channel and server profile',async()=>{
 let calls=0;
 const provider=createPairLiveLineProvider((async()=>++calls===1?json({client_id:'channel',expires_in:1200}):json({userId:'allowed',displayName:'Verified Admin'})) as typeof fetch);
 assert.deepEqual(await provider.verify('line-token','channel'),lineIdentity);assert.equal(calls,2);
});
for(const [name,body,status] of [
 ['forged',{},401],['expired',{client_id:'channel',expires_in:0},200],['wrong channel',{client_id:'other',expires_in:1200},200],
] as const){
 test(`shared LINE adapter rejects ${name} token before profile access`,async()=>{
  let calls=0;const provider=createPairLiveLineProvider((async()=>{calls++;return json(body,status)}) as typeof fetch);
  await assert.rejects(provider.verify('token','channel'));assert.equal(calls,1);
 });
}
test('valid identity must be server allowlisted before database writes',async()=>{
 const f=setup({allowlist:[{userId:'someone-else',role:'admin'}]});
 assert.deepEqual(await f.auth.verifyAdminIdentity('verified-line-token'),{ok:false,error:'admin_forbidden'});assert.equal(f.identities.size,0);
});
test('allowlisted verified identity creates independent admin identity',async()=>{
 const f=setup();const result=await f.auth.verifyAdminIdentity('verified-line-token');assert.equal(result.ok,true);
 if(result.ok){assert.equal(result.value.identity.providerUserId,'allowed');assert.equal(result.value.role,'admin')}
 assert.equal(f.identities.size,1);
});
test('provider errors fail closed and leak no error details',async()=>{
 const f=setup({identityProvider:{async verify(){throw new Error('SECRET_PROVIDER_DETAIL')}}});
 const result=await f.auth.verifyAdminIdentity('arbitrary');assert.equal(result.ok,false);assert.ok(!JSON.stringify(result).includes('SECRET'));
});
test('injected provider cannot bypass channel checking',async()=>{
 const f=setup({identityProvider:{async verify(){return {...lineIdentity,providerChannelId:'other'}}}});
 assert.deepEqual(await f.auth.verifyAdminIdentity('verified-line-token'),{ok:false,error:'identity_invalid'});assert.equal(f.identities.size,0);
});
test('session creation rejects a fabricated verified identity',async()=>{
 const f=setup();const result=await f.auth.createAdminSession({identity:{...lineIdentity,id:'forged',status:'active'},role:'admin'});
 assert.equal(result.ok,false);assert.equal(f.sessions.size,0);
});
test('disabled identities cannot be re-enabled by login',async()=>{
 const f=setup();f.identities.set('admin-1',{...lineIdentity,id:'admin-1',status:'disabled'});
 assert.deepEqual(await f.auth.verifyAdminIdentity('verified-line-token'),{ok:false,error:'admin_forbidden'});
});
test('incomplete and unsafe production configuration fails closed',async()=>{
 for(const override of [{channelId:''},{origin:''},{origin:'http://pair.example'},{allowlist:[]}] as const){
  assert.throws(()=>setup(override),error=>error instanceof Error&&'code' in error&&error.code==='admin_not_configured');
 }
});
test('verified identity capability can create only one session',async()=>{
 const f=setup();const result=await f.auth.verifyAdminIdentity('verified-line-token');assert.equal(result.ok,true);
 if(result.ok){assert.equal((await f.auth.createAdminSession(result.value)).ok,true);assert.equal((await f.auth.createAdminSession(result.value)).ok,false)}
});
test('shared LINE adapter rejects malformed expiry values instead of coercing them',async()=>{
 for(const expires_in of ['3600',null,-1,{},'Infinity']){
  let calls=0;const provider=createPairLiveLineProvider((async()=>{calls++;return calls===1?json({client_id:'channel',expires_in}):json({userId:'allowed',displayName:'Admin'})}) as typeof fetch);
  await assert.rejects(provider.verify('token','channel'));
 }
});
