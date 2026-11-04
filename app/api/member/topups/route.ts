import {currentMember,sameOrigin} from '../../../../lib/server/auth-http';
import {database} from '../../../../lib/server/db';
import {createTopupWithSlip,listTopups,maximumPoints,TopupError,validatePoints,uuid} from '../../../../lib/topup/store';
import {putSlip} from '../../../../lib/topup/slip';
import {MAX_QR_BYTES} from '../../../../lib/topup/qr';
import {dispatchTopupLine,lineAdminRecipients} from '../../../../lib/topup/line-notify';
import {noStore,topupFailure} from '../../../../lib/topup/http';
export const runtime='nodejs';
export async function GET(){
 try{
  const m=await currentMember();
  if(!m)return Response.json({error:'not_authenticated'},{status:401,headers:noStore});
  return Response.json({requests:await listTopups(database(),m.id),maxPoints:maximumPoints(),memberName:m.display_name,balance:m.demo_points},{headers:noStore});
 }catch(e){return topupFailure(e)}
}
export async function POST(request:Request){
 try{
  if(!sameOrigin(request))return Response.json({error:'forbidden'},{status:403,headers:noStore});
  const m=await currentMember();
  if(!m)return Response.json({error:'not_authenticated'},{status:401,headers:noStore});
  if(!request.headers.get('content-type')?.startsWith('multipart/form-data'))throw new TopupError('slip_required',400);
  const length=Number(request.headers.get('content-length')||'0');
  if(length>MAX_QR_BYTES+65536)throw new TopupError('invalid_image_size');
  const form=await request.formData();
  const points=Number(form.get('points'));
  validatePoints(points);
  const key=form.get('idempotencyKey');
  if(!uuid(key))throw new TopupError('invalid_idempotency_key');
  const file=form.get('slip');
  if(!(file instanceof File)||file.size<1||file.size>MAX_QR_BYTES)throw new TopupError('invalid_image_size');
  const slip=await putSlip(m.id,key,Buffer.from(await file.arrayBuffer()));
  const record=await createTopupWithSlip(database(),m.id,points,key,slip,lineAdminRecipients(process.env.ADMIN_AUTH_ALLOWLIST_JSON));
  // The member's topup is committed independently of LINE availability.
  // Persisted outbox rows can be retried from the protected admin API.
  try{await dispatchTopupLine(database())}catch(error){console.error('topup_line_dispatch_failed',error instanceof Error?error.name:'unknown')}
  return Response.json({request:record},{headers:noStore});
 }catch(e){return topupFailure(e)}
}
