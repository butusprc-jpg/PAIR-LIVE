import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {assertNeonMigrationTarget} from '../lib/server/neon-migration-target';
import {changeOa} from '../lib/owner/store';
import {verifyConnectedBot} from '../lib/owner/verify-bot';
import {singleOaReady} from '../lib/server/single-oa';

async function main(){
 const env=process.env;
 const options=assertNeonMigrationTarget(env);
 if(env.DATABASE_URL!==env.NEON_CUTOVER_DATABASE_URL||
    env.LINE_MESSAGING_CHANNEL_ID!=='2012365040'||
    env.LINE_LOGIN_CHANNEL_ID!=='2012365283'||
    !['2012365283-j7QSoLC2','2012365283-j74MVfWt'].includes(env.NEXT_PUBLIC_LINE_LIFF_ID||'')||
    !env.LINE_LOGIN_PROVIDER_ID||env.LINE_LOGIN_PROVIDER_ID!==env.LINE_MESSAGING_PROVIDER_ID||
    !/^@[A-Za-z0-9_-]{1,79}$/.test(env.CONNECTED_LINE_OA_ID||'')||
    !/^U[0-9a-f]{32}$/i.test(env.OWNER_LINE_USER_ID||'')||
    !env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN||
    !env.LINE_MESSAGING_CHANNEL_SECRET||!env.LINE_LOGIN_CHANNEL_SECRET)throw new Error('oa_binding_configuration_rejected');
 const oaId=env.CONNECTED_LINE_OA_ID!;
 const token=env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN!;
 const tokenHash=await verifyConnectedBot(oaId,token);
 const bot=await fetch('https://api.line.me/v2/bot/info',{
  headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(8000),
 });
 if(!bot.ok)throw new Error('oa_binding_unverified');
 const body:{basicId?:unknown;displayName?:unknown}=await bot.json();
 if(body.basicId!==oaId||typeof body.displayName!=='string'||!body.displayName.trim()||body.displayName.length>160)throw new Error('oa_binding_unverified');
 const db=new Pool({...options,max:2,connectionTimeoutMillis:5000});
 try{
  const found=await db.query<{id:string;line_oa_id:string;enabled:boolean;paused:boolean;deleted_at:Date|null;verified_token_hash:string|null;expires_at:Date}>(
   'SELECT id,line_oa_id,enabled,paused,deleted_at,verified_token_hash,expires_at FROM oa_service_control ORDER BY created_at');
  if(found.rows.some(row=>row.line_oa_id!==oaId&&row.deleted_at===null)||found.rows.filter(row=>row.line_oa_id===oaId&&row.deleted_at===null).length>1)throw new Error('oa_binding_conflict');
  const actor={channelId:env.LINE_LOGIN_CHANNEL_ID!,userId:env.OWNER_LINE_USER_ID!};
  let row=found.rows.find(item=>item.line_oa_id===oaId&&item.deleted_at===null);
  if(!row){
   const expiresAt=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+30*86400000));
   const added=await changeOa(db,actor,{action:'add',requestKey:randomUUID(),lineOaId:oaId,shopName:body.displayName,expiresAt});
   row={id:added.id,line_oa_id:oaId,enabled:false,paused:false,deleted_at:null,verified_token_hash:null,expires_at:added.expiresAt};
  }
  if(row.expires_at<=new Date())throw new Error('oa_binding_expired');
  if(!row.enabled)await changeOa(db,actor,{action:'enable',requestKey:randomUUID(),id:row.id});
  else if(row.paused)await changeOa(db,actor,{action:'resume',requestKey:randomUUID(),id:row.id});
  else if(row.verified_token_hash!==tokenHash)throw new Error('oa_binding_token_mismatch');
  if(!await singleOaReady(db))throw new Error('oa_binding_not_ready');
  console.log('oa_binding_ready');
 }finally{await db.end()}
}

void main().catch(error=>{console.error(error instanceof Error?error.message:'oa_binding_failed');process.exitCode=1});
