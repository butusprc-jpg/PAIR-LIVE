import {adminAccess,adminDenied} from '../../../../lib/server/admin-auth';
import {listEvidenceByRound,validRoundId} from '../../../../lib/evidence/repository';
import {database} from '../../../../lib/server/db';
export const runtime='nodejs';
export async function GET(request:Request){try{const access=await adminAccess(request,['admin','operator','viewer']);if(!access.ok)return adminDenied(access.error);const roundId=new URL(request.url).searchParams.get('roundId')||'';if(!validRoundId(roundId))return Response.json({error:'invalid_round_id'},{status:400});const [evidence,audit]=await Promise.all([listEvidenceByRound(roundId),database().query('SELECT id,round_id,actor,action,details,created_at FROM round_audit_logs WHERE round_id=$1 ORDER BY created_at,id',[roundId])]);return Response.json({roundId,evidence,audit:audit.rows},{headers:{'Cache-Control':'private, no-store'}})}catch{return Response.json({error:'evidence_unavailable'},{status:503})}}
