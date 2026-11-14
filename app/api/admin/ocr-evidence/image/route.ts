import {adminAccess,adminDenied} from '../../../../../lib/server/admin-auth';
import {database} from '../../../../../lib/server/db';
import {adminOaId} from '../../../../../lib/ocr/admin-oa';
import {configuredCandidateImageStorage} from '../../../../../lib/ocr/candidate-image-storage';
import {readCandidateImage} from '../../../../../lib/ocr/candidate-image-admin';

export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"};
export async function GET(request:Request){try{
 const access=await adminAccess(request,['admin','operator','viewer']);if(!access.ok)return adminDenied(access.error);
 const params=new URL(request.url).searchParams,id=params.get('id')||'',kind=params.get('kind');
 if(kind!=='full'&&kind!=='crop')return Response.json({error:'invalid_image_kind'},{status:400,headers});
 const storage=configuredCandidateImageStorage();if(!storage)return Response.json({error:'candidate_storage_not_configured'},{status:503,headers});
 const image=await readCandidateImage(database(),storage,await adminOaId(access.value.admin.id),id,kind);
 if(!image)return Response.json({error:'candidate_image_not_found'},{status:404,headers});
 return new Response(new Uint8Array(image),{headers:{...headers,'Content-Type':'image/png'}});
}catch{return Response.json({error:'candidate_image_unavailable'},{status:503,headers})}}
