import {adminAccess,adminDenied} from '../../../../lib/server/admin-auth';
export const runtime='nodejs';
export async function POST(request:Request){try{const access=await adminAccess(request,['admin','operator'],true);if(!access.ok)return adminDenied(access.error);return Response.json({error:'trusted_frame_capture_not_configured'},{status:409,headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'ocr_unavailable'},{status:503})}}
