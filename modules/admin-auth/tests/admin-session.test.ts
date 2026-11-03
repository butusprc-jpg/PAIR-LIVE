import test from 'node:test';
import assert from 'node:assert/strict';
import {login,request,setup,cookies} from './helpers';
import {createAdminAuth} from '../server/auth';

test('HTTP login stores only hashes and uses secure independent cookies',async()=>{
 const {f,response,cookie}=await login();assert.equal(response.status,200);
 const header=response.headers.get('set-cookie')!;
 assert.match(header,/HttpOnly/i);assert.match(header,/Secure/i);assert.match(header,/SameSite=Lax/i);assert.ok(!cookie.includes('pair_member_session'));
 const token=cookie.split('; ').find(x=>x.startsWith('pair_admin_session='))?.split('=')[1];assert.ok(token);
 const saved=[...f.sessions.values()][0];assert.notEqual(saved.tokenHash,token);assert.match(saved.tokenHash,/^[a-f0-9]{64}$/);
 assert.ok(!JSON.stringify([...f.sessions.values()]).includes(token!));
 assert.equal((await f.auth.getAdminSession(request('/session',{cookie}))).ok,true);
});
test('member cookie and random admin tokens cannot authenticate admin',async()=>{
 const signed=await login();const f=signed.f;const validToken=signed.cookie.split('=')[1];
 for(const cookie of ['pair_member_session='+validToken,'pair_member_session='+ 'A'.repeat(43),'pair_admin_session='+ 'A'.repeat(43),'']){
  assert.equal((await f.auth.getAdminSession(request('/session',{cookie}))).ok,false);
 }
});
test('session expiration is enforced',async()=>{
 const f=setup({sessionTtlSeconds:60});const signed=await login(f);assert.equal(signed.response.status,200);f.advance(60_000);
 assert.equal((await f.auth.getAdminSession(request('/session',{cookie:signed.cookie}))).ok,false);
});
test('explicit revocation invalidates session',async()=>{
 const {f,cookie}=await login();const found=await f.auth.getAdminSession(request('/session',{cookie}));assert.equal(found.ok,true);
 if(found.ok)assert.equal((await f.auth.revokeAdminSession(found.value)).ok,true);
 assert.equal((await f.auth.getAdminSession(request('/session',{cookie}))).ok,false);
});
test('logout revokes persisted session and old cookie cannot be reused',async()=>{
 const {f,cookie}=await login();
 const challenge=await f.auth.handleAdminChallenge(request('/challenge',{method:'POST',cookie,body:{purpose:'logout'}}));
 const {csrfToken}=await challenge.json() as {csrfToken:string};
 const response=await f.auth.handleAdminLogout(request('/logout',{method:'POST',cookie:cookie+'; '+cookies(challenge),csrf:csrfToken}));assert.equal(response.status,200);
 assert.equal((await f.auth.getAdminSession(request('/session',{cookie}))).ok,false);
 assert.ok(f.audits.some(event=>event.action==='logout'));
});
test('new login rotates session and revokes previous token',async()=>{
 const first=await login();const second=await login(first.f,first.cookie);assert.equal(second.response.status,200);assert.notEqual(first.cookie,second.cookie);
 assert.equal((await first.f.auth.getAdminSession(request('/session',{cookie:first.cookie}))).ok,false);
 assert.equal((await first.f.auth.getAdminSession(request('/session',{cookie:second.cookie}))).ok,true);
});
test('suspension and allowlist removal invalidate existing sessions',async()=>{
 const {f,cookie}=await login();const row=f.identities.get('admin-1')!;row.status='disabled';
 assert.equal((await f.auth.getAdminSession(request('/session',{cookie}))).ok,false);row.status='active';const reconfigured=createAdminAuth({...f.config,allowlist:[{userId:'other',role:'admin'}]});
 assert.equal((await reconfigured.getAdminSession(request('/session',{cookie}))).ok,false);
});
test('store failure returns generic service error',async()=>{
 const {f,cookie}=await login();f.config.sessionStore.find=async()=>{throw new Error('database secret')};
 const result=await f.auth.getAdminSession(request('/session',{cookie}));assert.equal(result.ok,false);assert.ok(!JSON.stringify(result).includes('secret'));
});
test('duplicate or malformed session cookies are rejected',async()=>{
 const {f,cookie}=await login();
 for(const value of [cookie+'; '+cookie,'pair_admin_session=invalid','pair_admin_session='+ '%41'.repeat(43)]){
  assert.equal((await f.auth.getAdminSession(request('/session',{cookie:value}))).ok,false);
 }
});
test('a disabled admin can still obtain a logout challenge and revoke its session',async()=>{
 const {f,cookie}=await login();f.identities.get('admin-1')!.status='disabled';
 const challenge=await f.auth.handleAdminChallenge(request('/challenge',{method:'POST',cookie,body:{purpose:'logout'}}));assert.equal(challenge.status,200);
 const {csrfToken}=await challenge.json() as {csrfToken:string};
 assert.equal((await f.auth.handleAdminLogout(request('/logout',{method:'POST',cookie:cookie+'; '+cookies(challenge),csrf:csrfToken}))).status,200);
 assert.notEqual([...f.sessions.values()][0].revokedAt,null);
});
