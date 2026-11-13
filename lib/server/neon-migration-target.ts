import {databaseConnectionOptions} from './db';

/** A one-shot migration may only target the existing Neon production database. */
export function assertNeonMigrationTarget(env:Record<string,string|undefined>){
 if(env.RAILWAY_PROJECT_ID!=='5a54ffee-e6e9-49c9-945e-9f2225c8acf8'||
    env.RAILWAY_ENVIRONMENT_ID!=='1eae6433-f3f1-474c-b1c6-aed7632ccdbf'||
    env.RAILWAY_ENVIRONMENT_NAME!=='staging'||env.RAILWAY_STAGING_NO_LINE!=='true')throw new Error('neon_migration_target_rejected');
 const raw=env.NEON_CUTOVER_DATABASE_URL;
 let url:URL;
 try{url=new URL(raw||'')}catch{throw new Error('neon_migration_target_rejected')}
 const expected='ep-young-violet-azvhetw6.c-3.ap-southeast-1.aws.neon.tech';
 const pooled=expected?.replace(/^(ep-[^.]+)(\.)/,'$1-pooler$2');
 if(!['postgres:','postgresql:'].includes(url.protocol)||!expected||
    env.EXPECTED_NEON_HOST?.toLowerCase()!==expected||![expected,pooled].includes(url.hostname.toLowerCase())||
    env.EXPECTED_NEON_DATABASE!=='neondb'||decodeURIComponent(url.pathname.slice(1))!=='neondb'||
    url.port&&url.port!=='5432')throw new Error('neon_migration_target_rejected');
 return databaseConnectionOptions(raw!);
}
