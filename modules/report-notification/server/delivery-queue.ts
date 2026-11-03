import {randomUUID} from 'node:crypto';
import type {Delivery,DeliveryOutcome,NotificationEvent,NotificationSettings,NotificationStore,ProviderResult} from './notification-types';
export const MAX_ATTEMPTS=4;
export function deliveriesFor(event:NotificationEvent,settings:NotificationSettings,now:string):Delivery[]{
 if(!settings.enabled)return [];
 return settings.recipients.filter(r=>r.enabled&&r.events.includes(event.type)&&
  (r.channel!=='email'||settings.emailFrequency==='both'||(settings.emailFrequency==='daily')===(event.type==='DAILY_SUMMARY'))).map(r=>({
  id:randomUUID(),eventId:event.eventId,idempotencyKey:`${event.eventId}:${r.channel}:${r.id}`,channel:r.channel,recipientId:r.id,address:r.address,
  status:'PENDING',attempts:0,nextAttemptAt:now,createdAt:now,sentAt:null,leaseOwner:null,leaseUntil:null,lastErrorCode:null,event
 }));
}
export async function enqueueEvent(store:NotificationStore,event:NotificationEvent,now:string):Promise<number>{
 await store.registerEvent(event);const settings=await store.getSettings();let added=0;
 for(const delivery of deliveriesFor(event,settings,now))if(await store.enqueue(delivery))added++;
 return added;
}
export function decideOutcome(result:ProviderResult,attempts:number,now:Date,maxAttempts=MAX_ATTEMPTS):DeliveryOutcome{
 const code=result.code&&/^(line_http_\d{3}|line_transport|recipient_invalid|timeout_invalid|email_rejected|email_recipient_invalid|email_transport|wechat_http_\d{3}|wechat_-?\d+|wechat_transport|wechat_permission_unknown|wechat_window_or_permission|openid_invalid|provider_throw|rate_limit)$/.test(result.code)?result.code:null;
 if(result.status==='ACCEPTED')return {status:'SENT',attempts,nextAttemptAt:now.toISOString(),sentAt:now.toISOString(),lastErrorCode:null};
 if(result.status==='NOT_CONFIGURED'||result.status==='NOT_SUPPORTED')return {status:result.status,attempts,nextAttemptAt:now.toISOString(),sentAt:null,lastErrorCode:code};
 if(result.status==='PERMANENT_ERROR'||attempts>=maxAttempts)return {status:'FAILED',attempts,nextAttemptAt:now.toISOString(),sentAt:null,lastErrorCode:code};
 const exponential=Math.min(60_000*2**Math.max(0,attempts-1),3_600_000);
 const delay=Math.max(exponential,Math.min(result.retryAfterMs??0,3_600_000));
 return {status:'RETRY',attempts,nextAttemptAt:new Date(now.getTime()+delay).toISOString(),sentAt:null,lastErrorCode:code};
}
