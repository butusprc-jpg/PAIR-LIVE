import {database} from '../../../../lib/server/db';
import {handleLineWebhook} from '../../../../lib/server/line-webhook';
import {processTopupPostback} from '../../../../lib/topup/line-postback';
export const runtime='nodejs';
export async function POST(request:Request){return handleLineWebhook(request,process.env.LINE_MESSAGING_CHANNEL_SECRET,async event=>{if(event.type==='postback'){await processTopupPostback(database(),{webhookEventId:event.webhookEventId,type:'postback',userId:event.userId,data:event.data||''});return}await database().query('INSERT INTO line_webhook_events(event_id,event_type,processing_status) VALUES($1,$2,\'RECEIVED\') ON CONFLICT(event_id) DO NOTHING',[event.webhookEventId,event.type])})}
