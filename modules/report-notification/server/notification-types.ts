export type NotificationEventType='ROUND_CLOSED'|'ROUND_SETTLED'|'OCR_REVIEW_REQUIRED'|'CAMERA_OFFLINE'|'STREAM_OFFLINE'|'WORKER_ERROR'|'DAILY_SUMMARY';
export type NotificationChannel='line'|'email'|'wechat';
export type DeliveryStatus='PENDING'|'PROCESSING'|'SENT'|'RETRY'|'FAILED'|'NOT_CONFIGURED'|'NOT_SUPPORTED';
export type NotificationErrorCode='INVALID_EVENT'|'NOT_FOUND'|'STORE_ERROR'|'PROVIDER_ERROR';
export type NotificationResult<T>={ok:true;value:T}|{ok:false;error:NotificationErrorCode};
export interface NotificationEvent {eventId:string;type:NotificationEventType;occurredAt:string;roundId?:string;date?:string;source:'core';payload:Record<string,string|number|null>}
export interface Recipient {id:string;channel:NotificationChannel;address:string;enabled:boolean;events:NotificationEventType[]}
export interface NotificationSettings {enabled:boolean;recipients:Recipient[];emailFrequency:'round'|'daily'|'both';dailyTimeBangkok:string;updatedAt:string}
export interface Delivery {id:string;eventId:string;idempotencyKey:string;channel:NotificationChannel;recipientId:string;address:string;status:DeliveryStatus;attempts:number;nextAttemptAt:string;createdAt:string;sentAt:string|null;leaseOwner:string|null;leaseUntil:string|null;lastErrorCode:string|null;event:NotificationEvent}
export type DeliveryOutcome={status:Exclude<DeliveryStatus,'PENDING'|'PROCESSING'>;attempts:number;nextAttemptAt:string;sentAt:string|null;lastErrorCode:string|null};
export interface NotificationStore {
 registerEvent(event:NotificationEvent):Promise<boolean>;
 enqueue(delivery:Delivery):Promise<boolean>;
 /** Atomic claim using row locks; reclaim expired processing leases. */
 claim(now:string,workerId:string,leaseMs:number,limit:number):Promise<Delivery[]>;
 /** Complete only if this worker still owns the lease. */
 complete(id:string,workerId:string,outcome:DeliveryOutcome):Promise<boolean>;
 getSettings():Promise<NotificationSettings>;
 updateSettings(settings:NotificationSettings):Promise<NotificationSettings>;
 getHistory(limit:number):Promise<Delivery[]>;
}
export type ProviderStatus='ACCEPTED'|'TEMPORARY_ERROR'|'PERMANENT_ERROR'|'NOT_CONFIGURED'|'NOT_SUPPORTED';
export interface ProviderResult {status:ProviderStatus;code?:string;retryAfterMs?:number}
export interface NotificationAdapter {send(delivery:Delivery,content:{text:string;html?:string;subject?:string}):Promise<ProviderResult>}
export interface NotificationServiceConfig {store:NotificationStore;line:NotificationAdapter;email:NotificationAdapter;wechat:NotificationAdapter;clock?:()=>Date;workerId?:string;maxAttempts?:number;leaseMs?:number;assertRoundSettled?:(roundId:string)=>Promise<NotificationEvent['payload']|false>;logger?:(entry:{event:string;deliveryId?:string;channel?:NotificationChannel;code?:string})=>void}
