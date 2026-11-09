export function assertRailwayStagingTarget(env:Record<string,string|undefined>){
 if(env.RAILWAY_PROJECT_ID!=='5a54ffee-e6e9-49c9-945e-9f2225c8acf8'||env.RAILWAY_ENVIRONMENT_ID!=='1eae6433-f3f1-474c-b1c6-aed7632ccdbf'||env.RAILWAY_ENVIRONMENT_NAME!=='staging'||env.RAILWAY_STAGING_NO_LINE!=='true')throw new Error('staging_target_guard_rejected');
 let url:URL;try{url=new URL(env.DATABASE_URL||'')}catch{throw new Error('staging_target_guard_rejected')}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname.endsWith('.railway.internal')||url.pathname!=='/railway'||url.port&&url.port!=='5432')throw new Error('staging_target_guard_rejected');
 return url.toString();
}
