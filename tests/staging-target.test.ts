import test from 'node:test';
import assert from 'node:assert/strict';
import {assertRailwayStagingTarget,assertRailwayRestoreTarget} from '../lib/server/staging-target';
test('staging migrator rejects production hosts, project and environment',()=>{
 const env={RAILWAY_PROJECT_ID:'5a54ffee-e6e9-49c9-945e-9f2225c8acf8',RAILWAY_ENVIRONMENT_ID:'1eae6433-f3f1-474c-b1c6-aed7632ccdbf',RAILWAY_ENVIRONMENT_NAME:'staging',RAILWAY_STAGING_NO_LINE:'true',DATABASE_URL:'postgresql://test:synthetic@postgres.railway.internal:5432/railway'};
 assert.match(assertRailwayStagingTarget(env),/postgres\.railway\.internal/);
 for(const patch of [{DATABASE_URL:'postgresql://test:synthetic@production.neon.tech/railway'},{DATABASE_URL:'postgresql://test:synthetic@postgres.railway.internal/production'},{RAILWAY_ENVIRONMENT_NAME:'production'},{RAILWAY_PROJECT_ID:'other'},{RAILWAY_STAGING_NO_LINE:'false'}])assert.throws(()=>assertRailwayStagingTarget({...env,...patch}),/staging_target_guard_rejected/);
});
test('restore migrator accepts only the isolated Railway database',()=>{
 const env={RAILWAY_PROJECT_ID:'5a54ffee-e6e9-49c9-945e-9f2225c8acf8',RAILWAY_ENVIRONMENT_ID:'1eae6433-f3f1-474c-b1c6-aed7632ccdbf',RAILWAY_ENVIRONMENT_NAME:'staging',RAILWAY_STAGING_NO_LINE:'true',RESTORE_TEST_DATABASE_URL:'postgresql://test:synthetic@postgres.railway.internal:5432/pair_live_restore_test'};
 assert.match(assertRailwayRestoreTarget(env),/pair_live_restore_test/);
 for(const patch of [{RESTORE_TEST_DATABASE_URL:'postgresql://test:synthetic@production.neon.tech/pair_live_restore_test'},{RESTORE_TEST_DATABASE_URL:'postgresql://test:synthetic@postgres.railway.internal/railway'},{RAILWAY_ENVIRONMENT_NAME:'production'},{RAILWAY_PROJECT_ID:'other'}])assert.throws(()=>assertRailwayRestoreTarget({...env,...patch}),/restore_target_guard_rejected/);
});
