import test from 'node:test';
import assert from 'node:assert/strict';
import {stagingApiBlocked} from '../lib/server/staging-gate';
test('synthetic staging disables all auth and financial APIs while retaining DB readiness',()=>{
 const env={RAILWAY_STAGING_NO_LINE:'true'};
 for(const path of ['/api/auth/line','/api/member/topups','/api/line/webhook','/api/admin/withdrawals','/api/round/start'])assert.equal(stagingApiBlocked(path,env),true);
 assert.equal(stagingApiBlocked('/api/health/ready',env),false);
 assert.equal(stagingApiBlocked('/api/health/db-target',env),false);
 assert.equal(stagingApiBlocked('/api/health/line-webhook',env),true);
 assert.equal(stagingApiBlocked('/api/member/topups',{}),false);
});
