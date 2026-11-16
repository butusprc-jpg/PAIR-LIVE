import {adminAccess,adminDenied} from '../../../../../lib/server/admin-auth';
import {database} from '../../../../../lib/server/db';
import {configuredCandidateImageStorage} from '../../../../../lib/ocr/candidate-image-storage';
import {verifyCandidateEvidence} from '../../../../../lib/ocr/automatic-settlement';
import {RequestTiming} from '../../../../../lib/server/performance-timing';

export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
export async function POST(request:Request){
 const timing=new RequestTiming();
 try{
  const access=await timing.measure('admin_auth',()=>adminAccess(request,['admin'],true));if(!access.ok)return adminDenied(access.error);
  if(Number(request.headers.get('content-length'))>1024)return Response.json({error:'body_too_large'},{status:413,headers});
  const raw=await request.text();if(raw.length>1024)return Response.json({error:'body_too_large'},{status:413,headers});
  let body:Record<string,unknown>;try{body=JSON.parse(raw)}catch{return Response.json({error:'invalid_json'},{status:400,headers})}
  if(typeof body.roundId!=='string'||!/^\d{1,18}$/.test(body.roundId)||typeof body.imageId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.imageId)||typeof body.confirmedNumber!=='string'||!/^\d+(?:\.\d+)?$/.test(body.confirmedNumber))return Response.json({error:'invalid_confirmation'},{status:400,headers});
  const storage=configuredCandidateImageStorage();if(!storage)return Response.json({error:'candidate_storage_not_configured'},{status:503,headers});
  const roundId=body.roundId as string,imageId=body.imageId as string,confirmedNumber=body.confirmedNumber as string;
  const result=await timing.measure('ocr_verify',()=>verifyCandidateEvidence(database(),roundId,storage,{adminId:access.value.admin.id,imageId,confirmedNumber}));
  return Response.json({roundId:body.roundId,evidenceId:result.evidenceId,status:'VERIFIED'},{headers:{...headers,'Server-Timing':timing.header()}});
 }catch(error){const code=error instanceof Error?error.message:'';const known=['candidate_not_ready','candidate_oa_invalid','candidate_metadata_invalid','candidate_image_missing','candidate_image_integrity_failed','candidate_evidence_conflict','candidate_confirmation_mismatch','admin_forbidden'];return Response.json({error:known.includes(code)?code:'confirmation_unavailable'},{status:code==='admin_forbidden'?403:known.includes(code)?409:503,headers:{...headers,'Server-Timing':timing.header()}})}
}
