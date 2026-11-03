import type {NotificationAdapter,ProviderResult} from './notification-types';
export interface LineAdminConfig {channelAccessToken?:string;fetch?:typeof fetch;timeoutMs?:number;minIntervalMs?:number}
/** LINE Messaging API push. Provider acceptance does not imply recipient read or OA friendship. */
export function createLineAdminAdapter(config:LineAdminConfig):NotificationAdapter{
 const fetcher=config.fetch??fetch;const timeout=config.timeoutMs??8000;let nextAllowedAt=0;
 return {async send(delivery,content):Promise<ProviderResult>{
  if(!config.channelAccessToken)return {status:'NOT_CONFIGURED'};
  if(!/^U[0-9a-f]{32}$/i.test(delivery.address))return {status:'PERMANENT_ERROR',code:'recipient_invalid'};
  if(!Number.isInteger(timeout)||timeout<100||timeout>30000)return {status:'PERMANENT_ERROR',code:'timeout_invalid'};
  try{
   const interval=Math.max(0,Math.min(config.minIntervalMs??0,60000));const delay=Math.max(0,nextAllowedAt-Date.now());if(delay)await new Promise(resolve=>setTimeout(resolve,delay));nextAllowedAt=Date.now()+interval;
   const response=await fetcher('https://api.line.me/v2/bot/message/push',{method:'POST',headers:{'Authorization':`Bearer ${config.channelAccessToken}`,'Content-Type':'application/json','X-Line-Retry-Key':delivery.id},body:JSON.stringify({to:delivery.address,messages:[{type:'text',text:content.text.slice(0,5000)}]}),signal:AbortSignal.timeout(timeout)});
   if(response.ok||response.status===409)return {status:'ACCEPTED'};
   if(response.status===429||response.status>=500)return {status:'TEMPORARY_ERROR',code:`line_http_${response.status}`,retryAfterMs:retryAfter(response)};
   return {status:'PERMANENT_ERROR',code:`line_http_${response.status}`};
  }catch{return {status:'TEMPORARY_ERROR',code:'line_transport'}};
 }};
}
function retryAfter(response:Response){const seconds=Number(response.headers.get('retry-after'));return Number.isFinite(seconds)&&seconds>=0?Math.min(seconds*1000,3600000):undefined}
