import {currentMember} from '../../../lib/server/auth-http';
import {database} from '../../../lib/server/db';
import {readShoppingLive} from '../../../modules/external-live/server/line-shopping';
import {LiveError} from '../../../modules/external-live/types';
export const runtime='nodejs';
export async function GET(){try{const member=await currentMember();if(!member)return Response.json({error:'not_authenticated'},{status:401});if(member.provider!=='line')return Response.json({error:'line_member_required'},{status:403});return Response.json(await readShoppingLive(database(),member.provider_channel_id,true),{headers:{'Cache-Control':'private, no-store'}})}catch(error){return Response.json({error:error instanceof LiveError?error.code:'live_unavailable'},{status:error instanceof LiveError?error.status:503})}}
