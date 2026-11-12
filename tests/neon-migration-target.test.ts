import test from 'node:test';
import assert from 'node:assert/strict';
import {assertNeonMigrationTarget} from '../lib/server/neon-migration-target';

const host='ep-young-violet-azvhetw6.c-3.ap-southeast-1.aws.neon.tech';
const env={RAILWAY_PROJECT_ID:'5a54ffee-e6e9-49c9-945e-9f2225c8acf8',RAILWAY_ENVIRONMENT_ID:'1eae6433-f3f1-474c-b1c6-aed7632ccdbf',RAILWAY_ENVIRONMENT_NAME:'staging',RAILWAY_STAGING_NO_LINE:'true',EXPECTED_NEON_HOST:host,EXPECTED_NEON_DATABASE:'neondb',NEON_CUTOVER_DATABASE_URL:`postgresql://user:secret@${host}/neondb?sslmode=require`};
test('Neon migration target requires the exact production endpoint and verified TLS',()=>{
 const options=assertNeonMigrationTarget(env);
 assert.deepEqual(options.ssl,{rejectUnauthorized:true});
 assert.ok(!options.connectionString.includes('sslmode='));
 assert.doesNotThrow(()=>assertNeonMigrationTarget({...env,NEON_CUTOVER_DATABASE_URL:env.NEON_CUTOVER_DATABASE_URL.replace(host,host.replace('.c-3.','-pooler.c-3.'))}));
 for(const patch of [{RAILWAY_PROJECT_ID:'other'},{RAILWAY_STAGING_NO_LINE:'false'},{EXPECTED_NEON_HOST:'other.neon.tech'},{EXPECTED_NEON_DATABASE:'other'},{NEON_CUTOVER_DATABASE_URL:'postgresql://user:secret@evil.neon.tech/neondb'},{NEON_CUTOVER_DATABASE_URL:`postgresql://user:secret@${host}/other`}])assert.throws(()=>assertNeonMigrationTarget({...env,...patch}),/neon_migration_target_rejected/);
});
