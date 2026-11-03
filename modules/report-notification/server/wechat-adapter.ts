import type {NotificationAdapter,ProviderResult} from './notification-types';
export interface WeChatConfig {appId?:string;accessToken?:string;fetch?:typeof fetch;timeoutMs?:number;minIntervalMs?:number;/** Host proves OA account has customer-service messaging permission AND recipient is inside its eligible interaction window. */ eligible?:(openid:string)=>Promise<boolean>}
/** Official WeChat OA customer-service API, gated by explicit account capability and recipient window. */
export function createWeChatAdapter(config:WeChatConfig):NotificationAdapter{
 const fetcher=config.fetch??fetch;const timeout=config.timeoutMs??8000;let nextAllowedAt=0;
 return {async send(delivery,content):Promise<ProviderResult>{
  if(!config.appId||!config.accessToken)return {status:'NOT_CONFIGURED'};
  if(!config.eligible)return {status:'NOT_SUPPORTED',code:'wechat_permission_unknown'};
  if(!/^[A-Za-z0-9_-]{8,128}$/.test(delivery.address))return {status:'PERMANENT_ERROR',code:'openid_invalid'};
  try{if(!await config.eligible(delivery.address))return {status:'NOT_SUPPORTED',code:'wechat_window_or_permission'};
   const interval=Math.max(0,Math.min(config.minIntervalMs??0,60000));const delay=Math.max(0,nextAllowedAt-Date.now());if(delay)await new Promise(resolve=>setTimeout(resolve,delay));nextAllowedAt=Date.now()+interval;
   const response=await fetcher(`https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${encodeURIComponent(config.accessToken)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({touser:delivery.address,msgtype:'text',text:{content:content.text.slice(0,2048)}}),signal:AbortSignal.timeout(timeout)});
   if(response.status===429||response.status>=500)return {status:'TEMPORARY_ERROR',code:`wechat_http_${response.status}`};
   if(!response.ok)return {status:'PERMANENT_ERROR',code:`wechat_http_${response.status}`};
   const body=await response.json() as {errcode?:unknown};const code=body.errcode;
   if(code===0)return {status:'ACCEPTED'};
   if([45009,-1].includes(Number(code)))return {status:'TEMPORARY_ERROR',code:`wechat_${code}`};
   if([48001,45015,43004].includes(Number(code)))return {status:'NOT_SUPPORTED',code:`wechat_${code}`};
   return {status:'PERMANENT_ERROR',code:`wechat_${typeof code==='number'?code:'unknown'}`};
  }catch{return {status:'TEMPORARY_ERROR',code:'wechat_transport'}};
 }};
}
