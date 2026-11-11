import {adminAccess,adminDenied} from '../../../../lib/server/admin-auth';
import {database} from '../../../../lib/server/db';
import {configureCamera,primaryCameraAction,provisionCameraSite,readCameraSite,renameCameraSite} from '../../../../modules/external-live/server/cameras';
import {LiveError} from '../../../../modules/external-live/types';
import {ensureStagingPrimaryCameraOa} from '../../../../modules/external-live/server/vdo-ninja';
export const runtime='nodejs';
async function channel(id:string){
 // The admin session has already been verified above. In isolated one-OA
 // staging, use the configured login channel instead of a stale identity
 // binding; never trust an OA identifier sent by a browser.
 if(process.env.RAILWAY_ENVIRONMENT_ID==='1eae6433-f3f1-474c-b1c6-aed7632ccdbf'
    &&process.env.RAILWAY_SINGLE_OA_MODE==='true'
    &&process.env.LINE_LOGIN_CHANNEL_ID)return process.env.LINE_LOGIN_CHANNEL_ID;
 return (await database().query<{provider_channel_id:string}>("SELECT provider_channel_id FROM admin_identities WHERE id=$1 AND provider='line' AND status='active'",[id])).rows[0]?.provider_channel_id
}
function failure(error:unknown){return Response.json({error:error instanceof LiveError?error.code:'camera_unavailable'},{status:error instanceof LiveError?error.status:503,headers:{'Cache-Control':'no-store'}})}
export async function GET(request:Request){try{const access=await adminAccess(request,['admin','operator','viewer']);if(!access.ok)return adminDenied(access.error);const id=await channel(access.value.admin.id);if(!id)return adminDenied('session_invalid');await ensureStagingPrimaryCameraOa(database(),id);const state=access.value.admin.role==='viewer'?await readCameraSite(database(),id,true):await provisionCameraSite(database(),id);return Response.json(state,{headers:{'Cache-Control':'private, no-store'}})}catch(error){return failure(error)}}
export async function POST(request:Request){try{const access=await adminAccess(request,['admin','operator'],true);if(!access.ok)return adminDenied(access.error);const id=await channel(access.value.admin.id);if(!id)return adminDenied('session_invalid');if(Number(request.headers.get('content-length'))>2048)return Response.json({error:'body_too_large'},{status:413});const raw=await request.text();if(raw.length>2048)return Response.json({error:'body_too_large'},{status:413});let body:Record<string,unknown>;try{body=JSON.parse(raw)}catch{return Response.json({error:'invalid_json'},{status:400})}if(!body||typeof body!=='object')return Response.json({error:'invalid_camera'},{status:400});if(access.value.admin.role!=='admin'&&(body.target!=='primary'||body.action==='save'))return adminDenied('admin_forbidden');const result=body.target==='primary'?await primaryCameraAction(database(),id,access.value.admin.id,{cameraId:body.cameraId,revision:body.revision,action:body.action,url:body.url}):body.target==='site'?await renameCameraSite(database(),id,access.value.admin.id,body.name,body.country):body.target==='camera'?await configureCamera(database(),id,access.value.admin.id,{cameraId:body.cameraId,revision:body.revision,name:body.name,sourceKind:body.sourceKind,streamId:body.streamId,action:body.action}):null;return result?Response.json(result,{headers:{'Cache-Control':'no-store'}}):Response.json({error:'invalid_camera'},{status:400})}catch(error){return failure(error)}}
