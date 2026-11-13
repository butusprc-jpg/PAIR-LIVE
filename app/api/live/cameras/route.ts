import {currentMember} from '../../../../lib/server/auth-http';
import {database} from '../../../../lib/server/db';
import {readCameraSite} from '../../../../modules/external-live/server/cameras';
import {LiveError} from '../../../../modules/external-live/types';
export const runtime='nodejs';
export async function GET(){try{const member=await currentMember();if(!member)return Response.json({error:'not_authenticated'},{status:401});if(member.provider!=='line'||!member.provider_channel_id)return Response.json({error:'line_member_required'},{status:403});return Response.json(await readCameraSite(database(),member.provider_channel_id),{headers:{'Cache-Control':'private, no-store'}})}catch(error){return Response.json({error:error instanceof LiveError?error.code:'camera_unavailable'},{status:error instanceof LiveError?error.status:503})}}
