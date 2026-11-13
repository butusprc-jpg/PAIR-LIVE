import {adminAccess,adminDenied} from '../../../../../lib/server/admin-auth';
import {decideRound} from '../../../../../lib/rounds/store';
import {RoundError} from '../../../../../lib/rounds/core';
export const runtime='nodejs';
export async function POST(request:Request){try{
 const access=await adminAccess(request,['admin','operator'],true);if(!access.ok)return adminDenied(access.error);
 const body=await request.json();if(body.action!=='stop'&&body.action!=='cancel')return Response.json({error:'invalid_round_action'},{status:400});
 if(body.action==='cancel'&&access.value.admin.role!=='admin')return Response.json({error:'admin_forbidden'},{status:403});
 return Response.json(await decideRound(access.value.admin.id,String(body.roundId),body.action),{headers:{'Cache-Control':'no-store'}});
}catch(error){if(error instanceof RoundError)return Response.json({error:error.code},{status:error.status});return Response.json({error:'round_unavailable'},{status:503})}}
