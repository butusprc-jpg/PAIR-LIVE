import {adminAccess,adminDenied} from '../../../../../lib/server/admin-auth';
import {currentRound,roundTotals} from '../../../../../lib/rounds/store';
export const runtime='nodejs';
export async function GET(request:Request){try{const access=await adminAccess(request,['admin','operator','viewer']);if(!access.ok)return adminDenied(access.error);const state=await currentRound();return Response.json({...state,totals:state.round?await roundTotals(state.round.id):null},{headers:{'Cache-Control':'private, no-store'}})}catch{return Response.json({error:'round_unavailable'},{status:503})}}
