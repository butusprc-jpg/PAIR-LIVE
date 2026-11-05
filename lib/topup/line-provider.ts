import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {lineAdminRecipients} from './line-notify';
import {TopupError} from './store';
export function providerPairConfigured(){const login=process.env.LINE_LOGIN_PROVIDER_ID,messaging=process.env.LINE_MESSAGING_PROVIDER_ID;return !!login&&!!messaging&&login===messaging&&!!process.env.LINE_LOGIN_CHANNEL_ID&&!!process.env.LINE_MESSAGING_CHANNEL_ID&&process.env.LINE_LOGIN_CHANNEL_ID!==process.env.LINE_MESSAGING_CHANNEL_ID}
export type VerifiedLineAdmin={id:string;name:string;userId:string};
export async function verifiedLineAdmin(pool:Pool,userId:string,allowlist=process.env.ADMIN_AUTH_ALLOWLIST_JSON):Promise<VerifiedLineAdmin|null>{
 if(!/^U[0-9a-f]{32}$/i.test(userId))return null;
 const channel=process.env.LINE_LOGIN_CHANNEL_ID;if(!channel)throw new TopupError('line_login_channel_not_configured',503);
 // A LINE user ID is scoped to its provider. No ID supplied in postback data is trusted.
 const q=await pool.query("SELECT id,display_name,role FROM admin_identities WHERE provider='line' AND provider_user_id=$1 AND provider_channel_id=$2 AND status='active'",[userId,channel]);
 const row=q.rows[0];return row&&(row.role==='admin'||row.role===null&&lineAdminRecipients(allowlist).includes(userId))?{id:row.id,name:row.display_name,userId}:null;
}
export function lineRetryKey(eventId:string){const hex=createHash('sha256').update('pair-live-topup-v2:'+eventId).digest('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`}
export async function pushLine(to:string,messages:unknown[],retryId:string,fetcher:typeof fetch=fetch,tokenOverride?:string){
 const token=tokenOverride??process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
 if(!token)throw new TopupError('line_token_not_configured',503);
 if(!/^U[0-9a-f]{32}$/i.test(to)||!messages.length||messages.length>5)throw new TopupError('invalid_line_message');
 const response=await fetcher('https://api.line.me/v2/bot/message/push',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-Line-Retry-Key':lineRetryKey(retryId)},body:JSON.stringify({to,messages}),signal:AbortSignal.timeout(8000)});
 if(!response.ok&&response.status!==409)throw new TopupError('line_delivery_failed',response.status>=500||response.status===429?503:422);
 return response.status;
}
