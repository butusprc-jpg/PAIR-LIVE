import test from 'node:test';
import assert from 'node:assert/strict';
import {assertRailwayRuntimeTarget} from '../lib/server/staging-target';

const preview={
 RAILWAY_PROJECT_ID:'72c7090f-dead-414e-8ce5-3f76ba0dcc6e',
 RAILWAY_ENVIRONMENT_ID:'aef0882f-d95e-4bad-b195-7244947313b5',
 RAILWAY_ENVIRONMENT_NAME:'preview',
 RAILWAY_STAGING_NO_LINE:'true',RAILWAY_SINGLE_OA_MODE:'false',
 NOTIFICATION_DELIVERY_ENABLED:'false',PAIR_WALLET_CUTOVER_VERIFIED:'false',
 EXPECTED_NEON_DATABASE:'pair_live_v16_preview',EXPECTED_NEON_HOST:'ep-synthetic.neon.tech',
 DATABASE_URL:'postgresql://test:synthetic@ep-synthetic.neon.tech/pair_live_v16_preview'
};
test('V16 isolated preview accepts only its synthetic database and disabled LINE',()=>{
 assert.equal(assertRailwayRuntimeTarget(preview),preview.DATABASE_URL);
 for(const patch of [
  {RAILWAY_PROJECT_ID:'some-other-project'},
  {RAILWAY_ENVIRONMENT_ID:'wrong'},
  {RAILWAY_ENVIRONMENT_NAME:'production'},
  {NOTIFICATION_DELIVERY_ENABLED:'true'},
  {RAILWAY_STAGING_NO_LINE:'false'},
  {PAIR_WALLET_CUTOVER_VERIFIED:'true'},
  {RAILWAY_SINGLE_OA_MODE:'true'},
  {LINE_MESSAGING_CHANNEL_ACCESS_TOKEN:'synthetic-token'},
  {LINE_LOGIN_CHANNEL_SECRET:'synthetic'},
  {NEON_CUTOVER_DATABASE_URL:preview.DATABASE_URL},
  {DATABASE_URL:'postgresql://test:synthetic@ep-synthetic.neon.tech/neondb'},
  {DATABASE_URL:'postgresql://test:synthetic@postgres.railway.internal/pair_live_v16_preview'},
  {EXPECTED_NEON_DATABASE:'neondb'}
 ])assert.throws(()=>assertRailwayRuntimeTarget({...preview,...patch}),/target_guard_rejected/);
});
