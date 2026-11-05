import {adminAccess,adminDenied} from '../../../../../lib/server/admin-auth';
import {currentRound} from '../../../../../lib/rounds/store';
export const runtime='nodejs';
export async function GET(request:Request){try{const access=await adminAccess(request,['admin','operator','viewer']);if(!access.ok)return adminDenied(access.error);return Response.json(await currentRound(),{headers:{'Cache-Control':'private, no-store'}})}catch{return Response.json({error:'round_unavailable'},{status:503})}}
