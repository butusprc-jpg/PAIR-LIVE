import type {NotificationAdapter,ProviderResult} from './notification-types';
export interface EmailMessage {to:string;subject:string;text:string;html:string;idempotencyKey:string}
export interface EmailTransport {send(message:EmailMessage):Promise<{accepted:boolean;temporary?:boolean;code?:string}>}
export interface EmailConfig {enabled:boolean;transport?:EmailTransport}
/** Transport is injected so SMTP/API credentials remain in the host's private server configuration. */
export function createEmailAdapter(config:EmailConfig):NotificationAdapter{
 return {async send(delivery,content):Promise<ProviderResult>{
  if(!config.enabled||!config.transport)return {status:'NOT_CONFIGURED'};
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(delivery.address))return {status:'PERMANENT_ERROR',code:'email_recipient_invalid'};
  try{const response=await config.transport.send({to:delivery.address,subject:content.subject||'PAIR LIVE',text:content.text,html:content.html||'',idempotencyKey:delivery.idempotencyKey});
   return response.accepted?{status:'ACCEPTED'}:{status:response.temporary?'TEMPORARY_ERROR':'PERMANENT_ERROR',code:'email_rejected'};
  }catch{return {status:'TEMPORARY_ERROR',code:'email_transport'}};
 }};
}
