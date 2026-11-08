import {ownerAccess,ownerFailure,OwnerError} from '../../../../../lib/owner/auth';
import {updateUsageAlerts} from '../../../../../lib/owner/usage';
import {database} from '../../../../../lib/server/db';
export const runtime='nodejs';
export async function POST(request:Request){try{const actor=await ownerAccess(request,true);if(Number(request.headers.get('content-length')||0)>2048)throw new OwnerError('request_too_large',413);const input=await request.json();return Response.json(await updateUsageAlerts(database(),actor,input.oaId,input),{headers:{'Cache-Control':'private, no-store'}})}catch(e){return ownerFailure(e)}}
