import {ownerAccess,ownerFailure,OwnerError} from '../../../../lib/owner/auth';
import {changeOa,listOas} from '../../../../lib/owner/store';
import {database} from '../../../../lib/server/db';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request){try{await ownerAccess(request);return Response.json(await listOas(database()),{headers})}catch(error){return ownerFailure(error)}}
export async function POST(request:Request){try{const actor=await ownerAccess(request,true);if(Number(request.headers.get('content-length')||0)>4096)throw new OwnerError('request_too_large',413);const body=await request.json();return Response.json(await changeOa(database(),actor,body),{headers})}catch(error){return ownerFailure(error)}}
