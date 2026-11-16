import {adminAccess,adminDenied} from '../../../../../lib/server/admin-auth';
import {database} from '../../../../../lib/server/db';
import {captureLiveFrame,chooseLiveFrameSource,roiForFrame,validNormalizedRoi,type LiveCamera,type NormalizedRoi} from '../../../../../lib/ocr/live-frame-source';
import {VdoLiveFrameSource} from '../../../../../lib/ocr/vdo-live-frame-source';
import {TesseractOcrAdapter} from '../../../../../lib/ocr/engine';
import {validateScaleDisplay,extractLastDisplayedDigit,determineParity,defaultOcrConfig} from '../../../../../lib/ocr/core';
import {resolveVdoTenant} from '../../../../../modules/external-live/server/vdo-ninja';

export const runtime='nodejs';
export const maxDuration=45;
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const cameraIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Limit expensive headless browsers and OCR processes per web instance.
const activeTests=new Set<string>();
type CameraRow=LiveCamera & {revision:string};

export async function POST(request:Request){
 const access=await adminAccess(request,['admin','operator'],true);
 if(!access.ok)return adminDenied(access.error);
 if(Number(request.headers.get('content-length'))>512)return Response.json({error:'body_too_large'},{status:413,headers});
 const raw=await request.text();
 if(raw.length>512)return Response.json({error:'body_too_large'},{status:413,headers});
 let cameraId:string;
 try{const body=JSON.parse(raw) as {cameraId?:unknown};cameraId=typeof body.cameraId==='string'?body.cameraId:''}
 catch{return Response.json({error:'invalid_json'},{status:400,headers})}
 if(!cameraIdPattern.test(cameraId))return Response.json({error:'invalid_camera_id'},{status:400,headers});
 if(activeTests.has(cameraId)||activeTests.size>=2)return Response.json({error:'ocr_test_busy'},{status:429,headers});
 activeTests.add(cameraId);
 let source:VdoLiveFrameSource|undefined;
 try{
  const pool=database();
  const channel=process.env.RAILWAY_ENVIRONMENT_ID==='1eae6433-f3f1-474c-b1c6-aed7632ccdbf'&&process.env.RAILWAY_SINGLE_OA_MODE==='true'&&process.env.LINE_LOGIN_CHANNEL_ID
   ?process.env.LINE_LOGIN_CHANNEL_ID
   :(await pool.query<{provider_channel_id:string}>("SELECT provider_channel_id FROM admin_identities WHERE id=$1 AND provider='line' AND status='active'",[access.value.admin.id])).rows[0]?.provider_channel_id;
  const tenant=await resolveVdoTenant(pool,channel);
  const readCamera=async()=>(await pool.query<CameraRow>(`SELECT c.camera_id AS "cameraId",c.oa_id AS "oaId",c.site_id AS "siteId",c.source_kind AS "sourceKind",
   CASE WHEN c.slot=1 THEN v.stream_id ELSE c.stream_id END AS "streamId",
   CASE WHEN c.slot=1 THEN v.display_enabled ELSE c.display_enabled END AS "displayEnabled",c.revision
   FROM site_cameras c LEFT JOIN vdo_ninja_tenants v ON v.oa_id=c.oa_id AND c.slot=1
   WHERE c.camera_id=$1 AND c.oa_id=$2`,[cameraId,tenant.id])).rows[0];
  const camera=await readCamera();
  if(!camera||!camera.displayEnabled||!tenant.active)return Response.json({error:'live_camera_unavailable'},{status:409,headers});
  const saved=(await pool.query<NormalizedRoi>(`SELECT x,y,width,height FROM camera_ocr_roi WHERE camera_id=$1 AND oa_id=$2`,[cameraId,tenant.id])).rows[0];
  if(!validNormalizedRoi(saved))return Response.json({error:'ocr_roi_not_saved'},{status:409,headers});
  source=chooseLiveFrameSource(camera,tenant.id,{VDO_NINJA:()=>new VdoLiveFrameSource()}) as VdoLiveFrameSource;
  const {frame}=await captureLiveFrame(source,camera,saved);
  const latest=await readCamera();
  if(!latest||latest.streamId!==camera.streamId||latest.revision!==camera.revision||!latest.displayEnabled)throw new Error('camera_changed_during_capture');
  const reading=await new TesseractOcrAdapter().read(frame,roiForFrame(saved,frame));
  let number:string;
  try{number=validateScaleDisplay(reading.normalizedText)}
  catch{return Response.json({status:'UNREADABLE',reason:'ambiguous_display',rawText:reading.rawText,confidence:reading.confidence,attempts:reading.attempts},{headers})}
  const lastDigit=extractLastDisplayedDigit(number);
  const reason=reading.conflict?'conflicting_ocr_results':reading.blurScore<defaultOcrConfig.minimumBlurScore?'blurry_image':reading.glareFraction>defaultOcrConfig.maximumGlareFraction?'glare':reading.confidence<defaultOcrConfig.minimumConfidence?'low_confidence':null;
  if(reason)return Response.json({status:'READ_UNVERIFIED',reason,number,lastDigit,parity:determineParity(lastDigit),rawText:reading.rawText,confidence:reading.confidence,attempts:reading.attempts,note:'PREVIEW_ONLY_NO_ROUND_NO_SETTLEMENT'},{headers});
  return Response.json({status:'READ',number,lastDigit,parity:determineParity(lastDigit),confidence:reading.confidence,at:frame.capturedAt,
   note:'PREVIEW_ONLY_NO_ROUND_NO_SETTLEMENT'},{headers});
 }catch(error){
  const code=error instanceof Error?error.message:'';
  return Response.json({error:['live_camera_adapter_unavailable','live_camera_unavailable','live_frame_stale_or_offline'].includes(code)?code:'ocr_test_unavailable'},
   {status:503,headers});
 }finally{activeTests.delete(cameraId);await source?.close().catch(()=>{})}
}
