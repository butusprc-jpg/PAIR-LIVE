import {adminAccess} from '../../../../lib/server/admin-auth';
import {database} from '../../../../lib/server/db';
import {dispatchTopupLine,topupLineDeliverySummary} from '../../../../lib/topup/line-notify';
import {noStore} from '../../../../lib/topup/http';
import {linePreflight} from '../../../../lib/line-preflight';
export const runtime='nodejs';
// Admin-only status; no LINE token or recipient IDs are sent to the browser.
export async function GET(request:Request){
 const a=await adminAccess(request,['admin']);
 if(!a.ok)return Response.json({error:a.error},{status:403,headers:noStore});
 try{return Response.json({deliveries:await topupLineDeliverySummary(database()),configured:!!process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN,preflight:linePreflight(process.env)},{headers:noStore})}
 catch{return Response.json({error:'notification_status_unavailable'},{status:503,headers:noStore})}
}
export async function POST(request:Request){
 const a=await adminAccess(request,['admin'],true);
 if(!a.ok)return Response.json({error:a.error},{status:403,headers:noStore});
 try{return Response.json({result:await dispatchTopupLine(database())},{headers:noStore})}
 catch{return Response.json({error:'notification_retry_failed'},{status:503,headers:noStore})}
}
