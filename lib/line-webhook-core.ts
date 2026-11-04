import {createHmac,timingSafeEqual} from 'node:crypto';
export function verifyLineSignature(raw:Buffer,signature:string|null,secret:string){if(!signature||!secret)return false;const expected=createHmac('sha256',secret).update(raw).digest();let received:Buffer;try{received=Buffer.from(signature,'base64')}catch{return false}return received.length===expected.length&&timingSafeEqual(received,expected)}
export type LineEvent={webhookEventId:string;type:'follow'|'unfollow'|'message'|'postback';userId:string;data?:string};
export function acceptedLineEvents(body:unknown):LineEvent[]{const events=(body as {events?:unknown})?.events;if(!Array.isArray(events))throw new Error('invalid_webhook_body');return events.flatMap((event):LineEvent[]=>{
 if(typeof event!=='object'||event===null)return [];
 const e=event as Record<string,unknown>;
 if(!['follow','unfollow','message','postback'].includes(String(e.type))||typeof e.webhookEventId!=='string'||!/^[A-Za-z0-9_-]{1,180}$/.test(e.webhookEventId))return [];
 const source=e.source as Record<string,unknown>|undefined;
 if(!source||source.type!=='user'||typeof source.userId!=='string'||!source.userId)return [];
 if(e.type==='message'){const message=e.message as Record<string,unknown>|undefined;if(!message||typeof message.id!=='string'||!message.id||typeof message.type!=='string')return []}
 if(e.type==='postback'){const postback=e.postback as Record<string,unknown>|undefined;if(!postback||typeof postback.data!=='string'||postback.data.length>300||!(postback.data.startsWith('topup:v2:')||postback.data.startsWith('withdraw:v1:')))return []}
 return [{webhookEventId:e.webhookEventId,type:e.type as LineEvent['type'],userId:source.userId,data:e.type==='postback'?(e.postback as {data:string}).data:undefined}];
})}
export async function handleLineWebhook(request:Request,secret:string|undefined,record:(event:LineEvent)=>Promise<void>):Promise<Response>{
 const json=(status:number,error:string)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
 if(!secret)return json(503,'webhook_not_configured');
 if(!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('content-type')||''))return json(415,'unsupported_media_type');
 const declared=Number(request.headers.get('content-length'));if(Number.isFinite(declared)&&declared>1024*1024)return json(413,'body_too_large');
 let raw:Buffer;try{raw=Buffer.from(await request.arrayBuffer())}catch{return json(400,'invalid_body')}
 if(raw.length>1024*1024)return json(413,'body_too_large');
 if(!verifyLineSignature(raw,request.headers.get('x-line-signature'),secret))return json(401,'invalid_signature');
 let events:LineEvent[];try{events=acceptedLineEvents(JSON.parse(raw.toString('utf8')))}catch{return json(400,'invalid_json')}
 try{for(const event of events)await record(event)}catch{return json(503,'webhook_unavailable')}
 return Response.json({ok:true,accepted:events.length},{headers:{'Cache-Control':'no-store'}});
}
