import {adminAccess,adminDenied} from '../../../../lib/server/admin-auth';
import {configuredAdapter,PUBLISHER_ID} from '../../../../lib/stream/livekit';
export const runtime='nodejs';
export async function POST(request:Request){try{const access=await adminAccess(request,['admin','operator'],true);if(!access.ok)return adminDenied(access.error);const adapter=configuredAdapter();if(!adapter)return Response.json({error:'stream_not_configured'},{status:503});return Response.json(await adapter.issueToken('publisher',PUBLISHER_ID),{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'stream_unavailable'},{status:503})}}
