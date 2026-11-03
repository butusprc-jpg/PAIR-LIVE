import test from 'node:test';
import assert from 'node:assert/strict';
import {cookies,login,request,setup} from './helpers';

test('role guards deny unauthorized role and permit explicit role',async()=>{
 const f=setup({allowlist:[{userId:'allowed',role:'viewer'}]});const {cookie}=await login(f);
 assert.equal((await f.auth.requireAdmin(request('/protected',{cookie}),['admin'])).ok,false);
 assert.equal((await f.auth.requireAdmin(request('/protected',{cookie}),['viewer'])).ok,true);
});
test('login rejects missing CSRF and cross-origin request',async()=>{
 const f=setup();for(const requestOrigin of ['https://attacker.example',null,undefined]){
  const response=await f.auth.handleAdminLogin(request('/login',{method:'POST',requestOrigin,body:{accessToken:'verified-line-token'}}));assert.equal(response.status,403);
 }
 assert.equal(f.sessions.size,0);
});
test('challenge endpoint requires POST and exact origin',async()=>{
 const f=setup();assert.equal((await f.auth.handleAdminChallenge(request('/challenge'))).status,405);
 for(const requestOrigin of ['https://attacker.example',null])assert.equal((await f.auth.handleAdminChallenge(request('/challenge',{method:'POST',requestOrigin,body:{purpose:'login'}}))).status,403);
});
test('login challenge is one-use: replay and simultaneous reuse fail',async()=>{
 const f=setup();const challenge=await f.auth.handleAdminChallenge(request('/challenge',{method:'POST',body:{purpose:'login'}}));
 const {csrfToken}=await challenge.json() as {csrfToken:string};const cookie=cookies(challenge);
 const attempt=()=>f.auth.handleAdminLogin(request('/login',{method:'POST',cookie,csrf:csrfToken,body:{accessToken:'verified-line-token'}}));
 const responses=await Promise.all([attempt(),attempt()]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,403]);
 assert.equal((await attempt()).status,403);assert.equal(f.sessions.size,1);
});
test('expired challenge cannot login',async()=>{
 const f=setup({challengeTtlSeconds:30});const challenge=await f.auth.handleAdminChallenge(request('/challenge',{method:'POST',body:{purpose:'login'}}));
 const {csrfToken}=await challenge.json() as {csrfToken:string};f.advance(30_000);
 assert.equal((await f.auth.handleAdminLogin(request('/login',{method:'POST',cookie:cookies(challenge),csrf:csrfToken,body:{accessToken:'verified-line-token'}}))).status,403);
});
test('mutation requires role, origin and purpose-bound one-use CSRF',async()=>{
 const {f,cookie}=await login();
 const challenge=await f.auth.handleAdminChallenge(request('/challenge',{method:'POST',cookie,body:{purpose:'mutation'}}));
 const {csrfToken}=await challenge.json() as {csrfToken:string};const options={method:'POST',cookie:cookie+'; '+cookies(challenge),csrf:csrfToken};
 assert.equal((await f.auth.requireAdminMutation(request('/protected',options),['admin'])).ok,true);
 assert.equal((await f.auth.requireAdminMutation(request('/protected',options),['admin'])).ok,false);
 assert.equal((await f.auth.requireAdminMutation(request('/protected',{method:'POST',cookie}),['admin'])).ok,false);
 assert.equal((await f.auth.requireAdminMutation(request('/protected',{cookie}),['admin'])).ok,false);
});
test('challenge cannot cross purpose or session boundary',async()=>{
 const a=await login();const b=await login(a.f);
 const challenge=await a.f.auth.handleAdminChallenge(request('/challenge',{method:'POST',cookie:a.cookie,body:{purpose:'mutation'}}));
 const {csrfToken}=await challenge.json() as {csrfToken:string};
 assert.equal((await a.f.auth.requireAdminMutation(request('/protected',{method:'POST',cookie:b.cookie+'; '+cookies(challenge),csrf:csrfToken}))).ok,false);
 assert.equal((await a.f.auth.handleAdminLogout(request('/logout',{method:'POST',cookie:a.cookie+'; '+cookies(challenge),csrf:csrfToken}))).status,403);
});
test('logout rejects missing CSRF and preserves valid session',async()=>{
 const {f,cookie}=await login();assert.equal((await f.auth.handleAdminLogout(request('/logout',{method:'POST',cookie}))).status,403);
 assert.equal((await f.auth.getAdminSession(request('/session',{cookie}))).ok,true);
});
test('session check is non-cacheable and exposes no token or provider identity',async()=>{
 const {f,cookie}=await login();const response=await f.auth.handleAdminSessionCheck(request('/session',{cookie}));assert.equal(response.status,200);
 assert.match(response.headers.get('cache-control')!,/no-store/);const body=await response.json();
 assert.equal(body.session.admin.displayName,'Verified Admin');assert.ok(!JSON.stringify(body).includes('tokenHash'));assert.ok(!JSON.stringify(body).includes('providerUserId'));
});
test('anonymous callers cannot mint mutation or logout challenges',async()=>{
 const f=setup();for(const purpose of ['mutation','logout']){
  const response=await f.auth.handleAdminChallenge(request('/challenge',{method:'POST',body:{purpose}}));assert.equal(response.status,401);
 }
});
test('a failed login consumes its challenge and does not permit retry replay',async()=>{
 const f=setup();const challenge=await f.auth.handleAdminChallenge(request('/challenge',{method:'POST',body:{purpose:'login'}}));
 const {csrfToken}=await challenge.json() as {csrfToken:string};const cookie=cookies(challenge);
 const first=await f.auth.handleAdminLogin(request('/login',{method:'POST',cookie,csrf:csrfToken,body:{accessToken:'forged'}}));assert.equal(first.status,401);
 const replay=await f.auth.handleAdminLogin(request('/login',{method:'POST',cookie,csrf:csrfToken,body:{accessToken:'verified-line-token'}}));assert.equal(replay.status,403);assert.equal(f.sessions.size,0);
});
