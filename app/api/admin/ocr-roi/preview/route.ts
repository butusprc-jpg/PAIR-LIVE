import {adminAccess,adminDenied} from '../../../../../lib/server/admin-auth';
import {database} from '../../../../../lib/server/db';
import {captureLiveFrame,chooseLiveFrameSource,type LiveCamera} from '../../../../../lib/ocr/live-frame-source';
import {VdoLiveFrameSource} from '../../../../../lib/ocr/vdo-live-frame-source';
import {resolveVdoTenant} from '../../../../../modules/external-live/server/vdo-ninja';

export const runtime='nodejs';
export const maxDuration=30;
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function GET(request:Request){
 const access=await adminAccess(request,['admin','operator','viewer']);if(!access.ok)return adminDenied(access.error);
 const cameraId=new URL(request.url).searchParams.get('cameraId')||'';
 if(!/^[0-9a-f-]{36}$/i.test(cameraId))return Response.json({error:'invalid_camera_id'},{status:400,headers});
 let source:VdoLiveFrameSource|undefined;
 try{
  const channel=process.env.RAILWAY_ENVIRONMENT_ID==='1eae6433-f3f1-474c-b1c6-aed7632ccdbf'&&process.env.RAILWAY_SINGLE_OA_MODE==='true'&&process.env.LINE_LOGIN_CHANNEL_ID
   ?process.env.LINE_LOGIN_CHANNEL_ID
   :(await database().query<{provider_channel_id:string}>("SELECT provider_channel_id FROM admin_identities WHERE id=$1 AND provider='line' AND status='active'",[access.value.admin.id])).rows[0]?.provider_channel_id;
  const tenant=await resolveVdoTenant(database(),channel);
  const readCamera=async()=> (await database().query<LiveCamera & {revision:string}>(`SELECT c.camera_id AS "cameraId",c.oa_id AS "oaId",c.site_id AS "siteId",c.source_kind AS "sourceKind",
   CASE WHEN c.slot=1 THEN v.stream_id ELSE c.stream_id END AS "streamId",
   CASE WHEN c.slot=1 THEN v.display_enabled ELSE c.display_enabled END AS "displayEnabled",c.revision
   FROM site_cameras c LEFT JOIN vdo_ninja_tenants v ON v.oa_id=c.oa_id AND c.slot=1
   WHERE c.camera_id=$1 AND c.oa_id=$2`,[cameraId,tenant.id])).rows[0];
  const camera=await readCamera();if(!camera||!camera.displayEnabled||!tenant.active) return Response.json({error:'live_camera_unavailable'},{status:409,headers});
  source=chooseLiveFrameSource(camera,tenant.id,{VDO_NINJA:()=>new VdoLiveFrameSource()}) as VdoLiveFrameSource;
  const {frame}=await captureLiveFrame(source,camera,{x:0,y:0,width:10000,height:10000});
  const latest=await readCamera();if(!latest||latest.streamId!==camera.streamId||latest.revision!==camera.revision||!latest.displayEnabled)throw new Error('camera_changed_during_capture');
  return new Response(new Uint8Array(frame.image),{headers:{...headers,'Content-Type':'image/png'}});
 }catch{return Response.json({error:'live_capture_unavailable'},{status:503,headers})}
 finally{await source?.close()}
}
