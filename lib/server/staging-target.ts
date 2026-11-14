export function assertRailwayStagingTarget(env:Record<string,string|undefined>){
 if(env.RAILWAY_PROJECT_ID!=='5a54ffee-e6e9-49c9-945e-9f2225c8acf8'||env.RAILWAY_ENVIRONMENT_ID!=='1eae6433-f3f1-474c-b1c6-aed7632ccdbf'||env.RAILWAY_ENVIRONMENT_NAME!=='staging'||env.RAILWAY_STAGING_NO_LINE!=='true')throw new Error('staging_target_guard_rejected');
 let url:URL;try{url=new URL(env.DATABASE_URL||'')}catch{throw new Error('staging_target_guard_rejected')}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname.endsWith('.railway.internal')||url.pathname!=='/railway'||url.port&&url.port!=='5432')throw new Error('staging_target_guard_rejected');
 return url.toString();
}

export function assertRailwayRestoreTarget(env:Record<string,string|undefined>){
 if(env.RAILWAY_PROJECT_ID!=='5a54ffee-e6e9-49c9-945e-9f2225c8acf8'||env.RAILWAY_ENVIRONMENT_ID!=='1eae6433-f3f1-474c-b1c6-aed7632ccdbf'||env.RAILWAY_ENVIRONMENT_NAME!=='staging'||env.RAILWAY_STAGING_NO_LINE!=='true')throw new Error('restore_target_guard_rejected');
 let url:URL;try{url=new URL(env.RESTORE_TEST_DATABASE_URL||'')}catch{throw new Error('restore_target_guard_rejected')}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname.endsWith('.railway.internal')||url.pathname!=='/pair_live_restore_test'||url.port&&url.port!=='5432')throw new Error('restore_target_guard_rejected');
 return url.toString();
}

/** Keep the synthetic API gate on while allowing only the preverified Neon cutover secret. */
export function assertRailwayRuntimeTarget(env:Record<string,string|undefined>){
 // Isolated V16 web preview: a fixed Railway project/environment and an empty
 // test database, with all production LINE/settlement delivery gates closed.
 if(env.RAILWAY_PROJECT_ID==='72c7090f-dead-414e-8ce5-3f76ba0dcc6e'){
  if(env.RAILWAY_ENVIRONMENT_ID!=='aef0882f-d95e-4bad-b195-7244947313b5'||
     env.RAILWAY_ENVIRONMENT_NAME!=='preview'||env.RAILWAY_STAGING_NO_LINE!=='true'||
     env.RAILWAY_SINGLE_OA_MODE!=='false'||env.NOTIFICATION_DELIVERY_ENABLED!=='false'||
     env.PAIR_WALLET_CUTOVER_VERIFIED!=='false'||env.NEON_CUTOVER_DATABASE_URL||
     env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN||env.LINE_MESSAGING_CHANNEL_SECRET||
     env.LINE_LOGIN_CHANNEL_SECRET)throw new Error('v16_preview_target_guard_rejected');
  let url:URL;try{url=new URL(env.DATABASE_URL||'')}catch{throw new Error('v16_preview_target_guard_rejected')}
  if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname.toLowerCase().endsWith('.neon.tech')||
     url.pathname!=='/pair_live_v16_preview'||env.EXPECTED_NEON_HOST?.toLowerCase()!==url.hostname.toLowerCase()||
     env.EXPECTED_NEON_DATABASE!=='pair_live_v16_preview'||url.port&&url.port!=='5432')
   throw new Error('v16_preview_target_guard_rejected');
  return url.toString();
 }

 if(env.DATABASE_URL!==env.NEON_CUTOVER_DATABASE_URL||!env.DATABASE_URL) return assertRailwayStagingTarget(env);
 if(env.RAILWAY_PROJECT_ID!=='5a54ffee-e6e9-49c9-945e-9f2225c8acf8'||env.RAILWAY_ENVIRONMENT_ID!=='1eae6433-f3f1-474c-b1c6-aed7632ccdbf'||env.RAILWAY_ENVIRONMENT_NAME!=='staging'||env.RAILWAY_STAGING_NO_LINE!=='true')throw new Error('runtime_target_guard_rejected');
 let url:URL;try{url=new URL(env.DATABASE_URL)}catch{throw new Error('runtime_target_guard_rejected')}
 const direct='ep-young-violet-azvhetw6.c-3.ap-southeast-1.aws.neon.tech';
 const pooled='ep-young-violet-azvhetw6-pooler.c-3.ap-southeast-1.aws.neon.tech';
 if(!['postgres:','postgresql:'].includes(url.protocol)||![direct,pooled].includes(url.hostname.toLowerCase())||url.pathname!=='/neondb'||env.EXPECTED_NEON_HOST?.toLowerCase()!==direct||env.EXPECTED_NEON_DATABASE!=='neondb'||url.port&&url.port!=='5432')throw new Error('runtime_target_guard_rejected');
 return env.DATABASE_URL;
}
