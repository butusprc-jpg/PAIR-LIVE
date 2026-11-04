import {database} from '../../../../lib/server/db';
import {handleLineWebhook} from '../../../../lib/server/line-webhook';
export const runtime='nodejs';
export async function POST(request:Request){return handleLineWebhook(request,process.env.LINE_MESSAGING_CHANNEL_SECRET,async event=>{await database().query('INSERT INTO line_webhook_events(event_id,event_type,processing_status) VALUES($1,$2,\'RECEIVED\') ON CONFLICT(event_id) DO NOTHING',[event.webhookEventId,event.type])})}
