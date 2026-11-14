import {adminAccess,adminDenied} from '../../../../lib/server/admin-auth';
import {database} from '../../../../lib/server/db';
import {validNormalizedRoi} from '../../../../lib/ocr/live-frame-source';
import {resolveVdoTenant} from '../../../../modules/external-live/server/vdo-ninja';

export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
const cameraIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function scopedCamera(adminId:string,cameraId:string){
 const channel=process.env.RAILWAY_ENVIRONMENT_ID==='1eae6433-f3f1-474c-b1c6-aed7632ccdbf'&&process.env.RAILWAY_SINGLE_OA_MODE==='true'&&process.env.LINE_LOGIN_CHANNEL_ID
  ?process.env.LINE_LOGIN_CHANNEL_ID
  :(await database().query<{provider_channel_id:string}>("SELECT provider_channel_id FROM admin_identities WHERE id=$1 AND provider='line' AND status='active'",[adminId])).rows[0]?.provider_channel_id;
 const tenant=await resolveVdoTenant(database(),channel);
 const camera=(await database().query<{camera_id:string;oa_id:string}>(`SELECT camera_id,oa_id FROM site_cameras WHERE camera_id=$1 AND oa_id=$2`,[cameraId,tenant.id])).rows[0];
 if(!camera)throw new Error('camera_not_found');
 return camera;
}
function failure(error:unknown){return Response.json({error:error instanceof Error&&error.message==='camera_not_found'?'camera_not_found':'ocr_roi_unavailable'},{status:error instanceof Error&&error.message==='camera_not_found'?404:503,headers})}
export async function GET(request:Request){try{
 const access=await adminAccess(request,['admin','operator','viewer']);if(!access.ok)return adminDenied(access.error);
 const cameraId=new URL(request.url).searchParams.get('cameraId')||'';if(!cameraIdPattern.test(cameraId))return Response.json({error:'invalid_camera_id'},{status:400,headers});
 const camera=await scopedCamera(access.value.admin.id,cameraId);
 const row=(await database().query<{x:number;y:number;width:number;height:number;revision:string}>(`SELECT x,y,width,height,revision FROM camera_ocr_roi WHERE camera_id=$1 AND oa_id=$2`,[cameraId,camera.oa_id])).rows[0];
 return Response.json({cameraId,roi:row?{x:row.x,y:row.y,width:row.width,height:row.height}:null,revision:row?Number(row.revision):0},{headers});
}catch(error){return failure(error)}}
export async function POST(request:Request){try{
 const access=await adminAccess(request,['admin'],true);if(!access.ok)return adminDenied(access.error);
 if(Number(request.headers.get('content-length'))>1024)return Response.json({error:'body_too_large'},{status:413,headers});
 const raw=await request.text();if(raw.length>1024)return Response.json({error:'body_too_large'},{status:413,headers});
 let body:{cameraId?:unknown;revision?:unknown;roi?:unknown};try{body=JSON.parse(raw)}catch{return Response.json({error:'invalid_json'},{status:400,headers})}
 if(typeof body.cameraId!=='string'||!cameraIdPattern.test(body.cameraId)||!Number.isSafeInteger(body.revision)||Number(body.revision)<0||!validNormalizedRoi(body.roi))return Response.json({error:'invalid_roi'},{status:400,headers});
 const camera=await scopedCamera(access.value.admin.id,body.cameraId);
 const roi=body.roi,revision=Number(body.revision);
 const row=(await database().query<{revision:string}>(`INSERT INTO camera_ocr_roi(camera_id,oa_id,x,y,width,height,updated_by)
 SELECT $1,$2,$3,$4,$5,$6,$7 WHERE $8=0 OR EXISTS(SELECT 1 FROM camera_ocr_roi WHERE camera_id=$1 AND oa_id=$2 AND revision=$8)
 ON CONFLICT(camera_id) DO UPDATE SET x=EXCLUDED.x,y=EXCLUDED.y,width=EXCLUDED.width,height=EXCLUDED.height,revision=camera_ocr_roi.revision+1,updated_at=now(),updated_by=EXCLUDED.updated_by
 WHERE camera_ocr_roi.oa_id=EXCLUDED.oa_id AND camera_ocr_roi.revision=$8
 RETURNING revision`,[body.cameraId,camera.oa_id,roi.x,roi.y,roi.width,roi.height,access.value.admin.id,revision])).rows[0];
 if(!row)return Response.json({error:'roi_conflict'},{status:409,headers});
 return Response.json({cameraId:body.cameraId,roi,revision:Number(row.revision)},{headers});
}catch(error){return failure(error)}}
