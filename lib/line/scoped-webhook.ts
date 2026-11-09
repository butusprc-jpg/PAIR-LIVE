import type {Pool} from 'pg';
import {handleLineWebhook} from '../line-webhook-core';
import {resolveWebhookOa} from '../owner/credential-store';

/** Endpoint key is only a selector. The raw-body signature supplies authority. */
export async function handleScopedWebhook(db:Pool,key:string,request:Request){
 let oa:Awaited<ReturnType<typeof resolveWebhookOa>>;
 try{oa=await resolveWebhookOa(db,key)}catch{return Response.json({ok:false,error:'oa_unavailable'},{status:503})}
 if(!oa)return Response.json({ok:false,error:'oa_unavailable'},{status:404});
 return handleLineWebhook(request,oa.channelSecret,async event=>{
  // Until financial requests and postbacks carry OA ownership, do not ACK one.
  if(event.type==='postback')throw new Error('scoped_postback_not_ready');
  await db.query(`INSERT INTO oa_line_webhook_receipts(oa_id,event_id,event_type) VALUES($1,$2,$3) ON CONFLICT(oa_id,event_id) DO NOTHING`,[oa.oaId,event.webhookEventId,event.type]);
 });
}
