import test from 'node:test';
import assert from 'node:assert/strict';
import {assertRailwayStagingTarget} from '../lib/server/staging-target';
test('staging migrator rejects production hosts, project and environment',()=>{
 const env={RAILWAY_PROJECT_ID:'5a54ffee-e6e9-49c9-945e-9f2225c8acf8',RAILWAY_ENVIRONMENT_ID:'1eae6433-f3f1-474c-b1c6-aed7632ccdbf',RAILWAY_ENVIRONMENT_NAME:'staging',RAILWAY_STAGING_NO_LINE:'true',DATABASE_URL:'postgresql://test:synthetic@postgres.railway.internal:5432/railway'};
 assert.match(assertRailwayStagingTarget(env),/postgres\.railway\.internal/);
 for(const patch of [{DATABASE_URL:'postgresql://test:synthetic@production.neon.tech/railway'},{DATABASE_URL:'postgresql://test:synthetic@postgres.railway.internal/production'},{RAILWAY_ENVIRONMENT_NAME:'production'},{RAILWAY_PROJECT_ID:'other'},{RAILWAY_STAGING_NO_LINE:'false'}])assert.throws(()=>assertRailwayStagingTarget({...env,...patch}),/staging_target_guard_rejected/);
});
