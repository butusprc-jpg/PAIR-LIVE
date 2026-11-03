import type {NotificationEvent,NotificationResult} from './notification-types';
/** Host calls once for each Bangkok date; the store's event ID uniqueness makes restarts idempotent. */
export async function enqueueDailySummary(date:string,build:(date:string)=>Promise<NotificationEvent>,enqueue:(event:NotificationEvent)=>Promise<NotificationResult<number>>){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return {ok:false,error:'INVALID_EVENT'} as const;
 const event=await build(date);
 if(event.type!=='DAILY_SUMMARY'||event.date!==date||event.eventId!==`daily:${date}`)return {ok:false,error:'INVALID_EVENT'} as const;
 return enqueue(event);
}
export function bangkokDate(now:Date):string{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)}
/** When the local Bangkok clock reaches HH:mm, enqueue once. Persistence owns deduplication. */
export function dailyDue(now:Date,timeBangkok:string):boolean{
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeBangkok))return false;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
 return `${parts.find(p=>p.type==='hour')?.value}:${parts.find(p=>p.type==='minute')?.value}`===timeBangkok;
}
