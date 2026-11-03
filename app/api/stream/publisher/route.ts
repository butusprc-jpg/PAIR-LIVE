import {adminAccess,adminDenied} from '../../../../lib/server/admin-auth';
import {configuredAdapter,PUBLISHER_ID} from '../../../../lib/stream/livekit';
import {currentRound} from '../../../../lib/rounds/store';
export const runtime='nodejs';
export async function POST(request:Request){try{const access=await adminAccess(request,['admin','operator'],true);if(!access.ok)return adminDenied(access.error);const state=await currentRound();if(!state.round||!['OPEN','CLOSED','SCANNING','REVIEW_REQUIRED'].includes(state.round.status))return Response.json({error:'round_not_streamable'},{status:409});const adapter=configuredAdapter();if(!adapter)return Response.json({error:'stream_not_configured'},{status:503});return Response.json(await adapter.issueToken('publisher',PUBLISHER_ID),{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'stream_unavailable'},{status:503})}}
