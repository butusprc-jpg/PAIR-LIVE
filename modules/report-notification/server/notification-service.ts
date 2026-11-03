import {randomUUID} from 'node:crypto';
import {enqueueEvent,decideOutcome} from './delivery-queue';
import {formatNotification} from './templates';
import type {Delivery,NotificationEvent,NotificationEventType,NotificationResult,NotificationServiceConfig,NotificationSettings} from './notification-types';
const types:NotificationEventType[]=['ROUND_CLOSED','ROUND_SETTLED','OCR_REVIEW_REQUIRED','CAMERA_OFFLINE','STREAM_OFFLINE','WORKER_ERROR','DAILY_SUMMARY'];
function validEvent(event:NotificationEvent):boolean{
 return !!event&&event.source==='core'&&typeof event.eventId==='string'&&event.eventId.length>0&&event.eventId.length<=180&&types.includes(event.type)&&Number.isFinite(Date.parse(event.occurredAt))&&!!event.payload&&typeof event.payload==='object'&&!Array.isArray(event.payload)&&
  (event.type==='DAILY_SUMMARY'?/^\d{4}-\d{2}-\d{2}$/.test(event.date||''):typeof event.roundId==='string'&&event.roundId.length>0);
}
export function createNotificationService(config:NotificationServiceConfig){
 if(!config?.store||!config.line||!config.email||!config.wechat)throw new Error('notification_not_configured');
 const clock=config.clock??(()=>new Date()),workerId=config.workerId??randomUUID(),maxAttempts=config.maxAttempts??4,leaseMs=config.leaseMs??30000;
 if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>10||!Number.isInteger(leaseMs)||leaseMs<1000||leaseMs>300000)throw new Error('notification_not_configured');
 const adapters={line:config.line,email:config.email,wechat:config.wechat};
 async function enqueueNotification(event:NotificationEvent):Promise<NotificationResult<number>>{
  if(!validEvent(event))return {ok:false,error:'INVALID_EVENT'};
  // The caller must supply a trusted Core event. Independently check persisted settlement before distributing result text.
  if(event.type==='ROUND_SETTLED'){
   if(!config.assertRoundSettled||!event.roundId)return {ok:false,error:'INVALID_EVENT'};
   try{const verified=await config.assertRoundSettled(event.roundId);if(!verified||!/^\d+(?:\.\d+)?$/.test(String(verified.resultNumber??'')))return {ok:false,error:'INVALID_EVENT'};for(const key of ['resultNumber','lastDigit','parity','evenMembers','evenEntries','evenPoints','oddMembers','oddEntries','oddPoints','evidenceStatus'])if(event.payload[key]!==verified[key])return {ok:false,error:'INVALID_EVENT'}}catch{return {ok:false,error:'STORE_ERROR'}}
  }
  try{return {ok:true,value:await enqueueEvent(config.store,event,clock().toISOString())}}catch{return {ok:false,error:'STORE_ERROR'}};
 }
 async function processPendingNotifications(limit=20):Promise<NotificationResult<{processed:number;sent:number;retry:number;failed:number}>>{
  if(!Number.isInteger(limit)||limit<1||limit>100)return {ok:false,error:'INVALID_EVENT'};
  let claimed:Delivery[];try{claimed=await config.store.claim(clock().toISOString(),workerId,leaseMs,limit)}catch{return {ok:false,error:'STORE_ERROR'}}
  const counts={processed:0,sent:0,retry:0,failed:0};
  for(const delivery of claimed){
   const adapter=adapters[delivery.channel];let result;
   try{result=await adapter.send(delivery,formatNotification(delivery.event))}catch{result={status:'TEMPORARY_ERROR' as const,code:'provider_throw'}}
   const now=clock();const outcome=decideOutcome(result,delivery.attempts+1,now,maxAttempts);
   try{if(await config.store.complete(delivery.id,workerId,outcome)){counts.processed++;if(outcome.status==='SENT')counts.sent++;else if(outcome.status==='RETRY')counts.retry++;else counts.failed++;
    config.logger?.({event:'delivery_completed',deliveryId:delivery.id,channel:delivery.channel,code:outcome.status});
   }}catch{return {ok:false,error:'STORE_ERROR'}}
  }
  return {ok:true,value:counts};
 }
 return {
  registerNotificationEvent:enqueueNotification,enqueueNotification,processPendingNotifications,
  async getNotificationSettings():Promise<NotificationResult<NotificationSettings>>{try{return {ok:true,value:await config.store.getSettings()}}catch{return {ok:false,error:'STORE_ERROR'}}},
  async updateNotificationSettings(settings:NotificationSettings):Promise<NotificationResult<NotificationSettings>>{
   if(!settings||!Array.isArray(settings.recipients)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.dailyTimeBangkok)||!['round','daily','both'].includes(settings.emailFrequency))return {ok:false,error:'INVALID_EVENT'};
   try{return {ok:true,value:await config.store.updateSettings(settings)}}catch{return {ok:false,error:'STORE_ERROR'}}
  },
  async getDeliveryHistory(limit=100):Promise<NotificationResult<Delivery[]>>{
   if(!Number.isInteger(limit)||limit<1||limit>1000)return {ok:false,error:'INVALID_EVENT'};
   try{return {ok:true,value:await config.store.getHistory(limit)}}catch{return {ok:false,error:'STORE_ERROR'}}
  },
 };
}
