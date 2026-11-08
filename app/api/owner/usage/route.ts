import {ownerAccess,ownerFailure,OwnerError} from '../../../../lib/owner/auth';
import {allowUsageRead} from '../../../../lib/owner/usage-rate';
import {ownerUsage} from '../../../../lib/owner/usage';
import {database} from '../../../../lib/server/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){try{const actor=await ownerAccess(request);if(!allowUsageRead(actor.sessionHash))throw new OwnerError('rate_limited',429);return Response.json(await ownerUsage(database()),{headers:{'Cache-Control':'private, no-store'}})}catch(e){return ownerFailure(e)}}
