import {currentMember,sameOrigin} from '../../../../lib/server/auth-http';
import {database} from '../../../../lib/server/db';
import {createTopup,listTopups,maximumPoints,TopupError,validatePoints,uuid} from '../../../../lib/topup/store';
import {dispatchTopupLine,activeLineAdminRecipients} from '../../../../lib/topup/line-notify';
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
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new TopupError('invalid_content_type');
  const body=await request.json() as {points?:unknown;idempotencyKey?:unknown};
  const points=body.points;
  validatePoints(points);
  const key=body.idempotencyKey;
  if(!uuid(key))throw new TopupError('invalid_idempotency_key');
  const record=await createTopup(database(),m.id,points,key,await activeLineAdminRecipients(database(),process.env.ADMIN_AUTH_ALLOWLIST_JSON));
  // The member's topup is committed independently of LINE availability.
  // Persisted outbox rows can be retried from the protected admin API.
  try{await dispatchTopupLine(database())}catch(error){console.error('topup_line_dispatch_failed',error instanceof Error?error.name:'unknown')}
  return Response.json({request:record},{headers:noStore});
 }catch(e){return topupFailure(e)}
}
