import {currentMember,sameOrigin} from '../../../../lib/server/auth-http';
import {database} from '../../../../lib/server/db';
import {createWithdrawal,listWithdrawals} from '../../../../lib/withdrawal/store';
import {dispatchWithdrawalLine} from '../../../../lib/withdrawal/line';
import {activeLineAdminRecipients} from '../../../../lib/topup/line-notify';
import {TopupError} from '../../../../lib/topup/store';
import {noStore,topupFailure} from '../../../../lib/topup/http';
import {memberAvailablePoints} from '../../../../lib/server/wallet-cutover';
import {requireMatchingStagingWebhook} from '../../../../lib/topup/webhook-binding';
export const runtime='nodejs';
export async function GET(){
 try{
  const member=await currentMember();
  if(!member)return Response.json({error:'not_authenticated'},{status:401,headers:noStore});
  return Response.json({requests:await listWithdrawals(database(),member.id),balance:await memberAvailablePoints(database(),member.id,member.demo_points)},{headers:noStore});
 }catch(e){return topupFailure(e)}
}
export async function POST(request:Request){
 try{
  if(!sameOrigin(request))return Response.json({error:'forbidden'},{status:403,headers:noStore});
  const member=await currentMember();
  if(!member)return Response.json({error:'not_authenticated'},{status:401,headers:noStore});
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new TopupError('invalid_content_type');
  const body=await request.json() as {points?:unknown;details?:unknown;idempotencyKey?:unknown};
  await requireMatchingStagingWebhook();
  const row=await createWithdrawal(database(),member.id,body.points,body.details,body.idempotencyKey,await activeLineAdminRecipients(database(),process.env.ADMIN_AUTH_ALLOWLIST_JSON));
  try{await dispatchWithdrawalLine(database())}catch(e){console.error('withdrawal_line_dispatch_failed',e instanceof Error?e.name:'unknown')}
  return Response.json({request:{id:row.id,requested_points:row.requested_points,status:row.status,replayed:row.replayed}},{headers:noStore});
 }catch(e){return topupFailure(e)}
}
