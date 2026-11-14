import {adminAccess,adminDenied} from '../../../../lib/server/admin-auth';
import {database} from '../../../../lib/server/db';
import {adminOaId} from '../../../../lib/ocr/admin-oa';
import {configuredCandidateImageStorage} from '../../../../lib/ocr/candidate-image-storage';
import {deleteCandidateImages,listCandidateImages} from '../../../../lib/ocr/candidate-image-admin';

export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
function failure(error:unknown){const code=error instanceof Error?error.message:'evidence_unavailable';const status=code==='candidate_image_not_found'?404:code==='candidate_image_still_required'?409:code==='invalid_evidence_ids'||code==='invalid_evidence_filter'?400:503;return Response.json({error:['candidate_image_not_found','candidate_image_still_required','invalid_evidence_ids','invalid_evidence_filter'].includes(code)?code:'evidence_unavailable'},{status,headers})}
export async function GET(request:Request){try{
 const access=await adminAccess(request,['admin','operator','viewer']);if(!access.ok)return adminDenied(access.error);
 const roundId=new URL(request.url).searchParams.get('roundId')||undefined;
 const images=await listCandidateImages(database(),await adminOaId(access.value.admin.id),roundId);
 return Response.json({images},{headers});
}catch(error){return failure(error)}}
export async function POST(request:Request){try{
 const access=await adminAccess(request,['admin'],true);if(!access.ok)return adminDenied(access.error);
 if(Number(request.headers.get('content-length'))>2048)return Response.json({error:'body_too_large'},{status:413,headers});
 const raw=await request.text();if(raw.length>2048)return Response.json({error:'body_too_large'},{status:413,headers});
 let body:{ids?:unknown};try{body=JSON.parse(raw)}catch{return Response.json({error:'invalid_json'},{status:400,headers})}
 const storage=configuredCandidateImageStorage();if(!storage)throw new Error('candidate_storage_not_configured');
 const results=await deleteCandidateImages(database(),storage,await adminOaId(access.value.admin.id),access.value.admin.id,body.ids as string[]);
 return Response.json({results},{headers});
}catch(error){return failure(error)}}
