import {currentMember,sameOrigin} from '../../../../lib/server/auth-http';
import {database} from '../../../../lib/server/db';
import {createTopup,listTopups,maximumPoints} from '../../../../lib/topup/store';
import {noStore,topupFailure} from '../../../../lib/topup/http';
export const runtime='nodejs';
export async function GET(){try{const m=await currentMember();if(!m)return Response.json({error:'not_authenticated'},{status:401,headers:noStore});return Response.json({requests:await listTopups(database(),m.id),maxPoints:maximumPoints(),memberName:m.display_name,balance:m.demo_points},{headers:noStore})}catch(e){return topupFailure(e)}}
export async function POST(request:Request){try{if(!sameOrigin(request))return Response.json({error:'forbidden'},{status:403});const m=await currentMember();if(!m)return Response.json({error:'not_authenticated'},{status:401});const b=await request.json();return Response.json({request:await createTopup(database(),m.id,b.points,b.idempotencyKey)},{headers:noStore})}catch(e){return topupFailure(e)}}
