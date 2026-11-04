import {randomUUID} from 'node:crypto';
import {providerPairConfigured} from '../../../../lib/topup/line-provider';
import {adminAccess} from '../../../../lib/server/admin-auth';
import {database} from '../../../../lib/server/db';
import {createLineAdminAdapter} from '../../../../modules/report-notification/server/line-admin-adapter';
import {noStore} from '../../../../lib/topup/http';
export const runtime='nodejs';
// Explicit admin-only diagnostic: send a test, never a synthetic top-up.
export async function POST(request:Request){
 const auth=await adminAccess(request,['admin'],true);
 if(!auth.ok)return Response.json({error:auth.error},{status:403,headers:noStore});
 const token=process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
 if(!token||!providerPairConfigured())return Response.json({error:'line_provider_not_configured'},{status:503,headers:noStore});
 try{
  const c=await database().connect();let row:{provider_user_id:string}|undefined;
  try{
   const r=await c.query<{provider_user_id:string}>(`SELECT provider_user_id FROM admin_identities WHERE id=$1 AND status='active' AND provider='line' AND provider_channel_id=$2`,[auth.value.admin.id,process.env.LINE_LOGIN_CHANNEL_ID||'']);
   row=r.rows[0];
  }finally{c.release()}
  if(!row||!/^U[0-9a-f]{32}$/i.test(row.provider_user_id))return Response.json({error:'line_admin_recipient_unavailable'},{status:403,headers:noStore});
  const adapter=createLineAdminAdapter({channelAccessToken:token,timeoutMs:8000});
  const result=await adapter.send({id:randomUUID(),address:row.provider_user_id} as Parameters<typeof adapter.send>[0],{text:'✅ PAIR LIVE: ทดสอบข้อความแจ้งเตือนแอดมินสำเร็จ\nหากคุณเห็นข้อความนี้ การส่ง LINE Messaging API มาถึงแชตบัญชีนี้แล้ว\nข้อความนี้ไม่ใช่รายการเติมแต้ม'});
  if(result.status==='ACCEPTED')return Response.json({ok:true,accepted:true},{headers:noStore});
  const reason=result.code||result.status;
  return Response.json({ok:false,error:reason},{status:result.status==='TEMPORARY_ERROR'?503:422,headers:noStore});
 }catch{return Response.json({error:'line_test_unavailable'},{status:503,headers:noStore})}
}
