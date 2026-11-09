import {ownerAccess,ownerFailure} from '../../../../../lib/owner/auth';
import {OwnerError} from '../../../../../lib/owner/errors';
import {rotateOaCredentials} from '../../../../../lib/owner/credential-store';
import {database} from '../../../../../lib/server/db';
export const runtime='nodejs';
export async function POST(request:Request){
 try{
  const actor=await ownerAccess(request,true);
  if(Number(request.headers.get('content-length')||0)>8192)throw new OwnerError('request_too_large',413);
  const body=await request.json();const result=await rotateOaCredentials(database(),body.oaId,`${actor.channelId}:${actor.userId}`,body);
  return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(error){return ownerFailure(error)}
}
