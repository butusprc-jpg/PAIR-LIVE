import {adminAccess,adminDenied} from '../../../../lib/server/admin-auth';
export const runtime='nodejs';
/** Kept as a guarded legacy endpoint; LIVE never creates a round. */
export async function POST(request:Request){const access=await adminAccess(request,['admin','operator'],true);if(!access.ok)return adminDenied(access.error);return Response.json({error:'use_manual_round_start'},{status:410,headers:{'Cache-Control':'no-store'}})}
