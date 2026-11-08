import {createHash} from 'node:crypto';
export type LineUsage={status:'OK'|'NOT_CONNECTED'|'ERROR';used:number|null;quota:number|null;quotaType:string|null;fetchedAt:string|null;errorCode?:string};
const cache=new Map<string,{expires:number;value:LineUsage}>();
const pending=new Map<string,Promise<LineUsage>>();
export function clearLineUsageCache(){cache.clear();pending.clear()}
export function connectedToken(oa:{line_oa_id:string;verified_token_hash:string|null}){
 if(oa.line_oa_id!==process.env.CONNECTED_LINE_OA_ID)return null;
 const token=process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
 if(!token||!oa.verified_token_hash||createHash('sha256').update(token).digest('hex')!==oa.verified_token_hash)return null;
 return token;
}
export async function fetchLineUsage(oaId:string,token:string|null,fetcher:typeof fetch=fetch,now=Date.now()):Promise<LineUsage>{
 if(!token)return {status:'NOT_CONNECTED',used:null,quota:null,quotaType:null,fetchedAt:null};
 const key=oaId+':'+createHash('sha256').update(token).digest('hex');
 const cached=cache.get(key);if(cached&&cached.expires>now)return cached.value;
 const inFlight=pending.get(key);if(inFlight)return inFlight;
 const task=(async()=>{let result:LineUsage;
  try{
   const headers={Authorization:`Bearer ${token}`};
   const [q,c]=await Promise.all(['/v2/bot/message/quota','/v2/bot/message/quota/consumption'].map(path=>fetcher('https://api.line.me'+path,{headers,signal:AbortSignal.timeout(5000)})));
   if(!q.ok||!c.ok)throw new Error(q.status===401||c.status===401?'UNAUTHORIZED':'LINE_HTTP_ERROR');
   const quota=await q.json() as {type?:unknown;value?:unknown},consumption=await c.json() as {totalUsage?:unknown};
   if(!['limited','none'].includes(String(quota.type))||quota.type==='limited'&&(!Number.isSafeInteger(quota.value)||Number(quota.value)<0)||!Number.isSafeInteger(consumption.totalUsage)||Number(consumption.totalUsage)<0)throw new Error('INVALID_RESPONSE');
   result={status:'OK',quotaType:String(quota.type),quota:quota.type==='limited'?Number(quota.value):null,used:Number(consumption.totalUsage),fetchedAt:new Date(now).toISOString()};
  }catch(error){const code=error instanceof Error&&['UNAUTHORIZED','LINE_HTTP_ERROR','INVALID_RESPONSE'].includes(error.message)?error.message:'LINE_UNAVAILABLE';result={status:'ERROR',used:null,quota:null,quotaType:null,fetchedAt:null,errorCode:code}}
  cache.set(key,{value:result,expires:now+(result.status==='OK'?300000:60000)});return result;
 })();pending.set(key,task);try{return await task}finally{pending.delete(key)}
}
