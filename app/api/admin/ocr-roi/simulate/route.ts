import {adminAccess,adminDenied} from '../../../../../lib/server/admin-auth';
import {database} from '../../../../../lib/server/db';
import {resolveVdoTenant} from '../../../../../modules/external-live/server/vdo-ninja';
import {chooseLiveFrameSource,type LiveCamera} from '../../../../../lib/ocr/live-frame-source';
import {VdoLiveFrameSource} from '../../../../../lib/ocr/vdo-live-frame-source';
import {TesseractOcrAdapter} from '../../../../../lib/ocr/engine';
import {roiForFrame,validNormalizedRoi,type NormalizedRoi} from '../../../../../lib/ocr/live-frame-source';
import {validateScaleDisplay,extractLastDisplayedDigit,determineParity,defaultOcrConfig} from '../../../../../lib/ocr/core';

export const runtime='nodejs';
export const maxDuration=45;
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const active=new Set<string>();
export async function POST(request:Request){
 const access=await adminAccess(request,['admin','operator'],true);if(!access.ok)return adminDenied(access.error);
 if(Number(request.headers.get('content-length'))>512)return Response.json({error:'body_too_large'},{status:413,headers});
 const raw=await request.text();if(raw.length>512)return Response.json({error:'body_too_large'},{status:413,headers});
 let cameraId='';try{const body=JSON.parse(raw);cameraId=typeof body.cameraId==='string'?body.cameraId:''}catch{return Response.json({error:'invalid_json'},{status:400,headers})}
 if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(cameraId))return Response.json({error:'invalid_camera_id'},{status:400,headers});
 if(active.has(cameraId)||active.size>=2)return Response.json({error:'ocr_test_busy'},{status:429,headers});active.add(cameraId);
 let source:VdoLiveFrameSource|undefined;
 try{
  const pool=database();
  const channel=process.env.RAILWAY_ENVIRONMENT_ID==='1eae6433-f3f1-474c-b1c6-aed7632ccdbf'&&process.env.RAILWAY_SINGLE_OA_MODE==='true'&&process.env.LINE_LOGIN_CHANNEL_ID
   ?process.env.LINE_LOGIN_CHANNEL_ID
   :(await pool.query<{provider_channel_id:string}>("SELECT provider_channel_id FROM admin_identities WHERE id=$1 AND provider='line' AND status='active'",[access.value.admin.id])).rows[0]?.provider_channel_id;
  const tenant=await resolveVdoTenant(pool,channel);
  const camera=(await pool.query<LiveCamera & {revision:string}>(`SELECT c.camera_id AS "cameraId",c.oa_id AS "oaId",c.site_id AS "siteId",c.source_kind AS "sourceKind",
   CASE WHEN c.slot=1 THEN v.stream_id ELSE c.stream_id END AS "streamId",
   CASE WHEN c.slot=1 THEN v.display_enabled ELSE c.display_enabled END AS "displayEnabled",c.revision
   FROM site_cameras c LEFT JOIN vdo_ninja_tenants v ON v.oa_id=c.oa_id AND c.slot=1 WHERE c.camera_id=$1 AND c.oa_id=$2`,[cameraId,tenant.id])).rows[0];
  if(!camera||!tenant.active||!camera.streamId)return Response.json({error:'live_camera_unavailable'},{status:409,headers});
  // The click simulates a server-side stop timestamp; capture starts only after its deadline.
  const readyAt=Date.now()+3000;await new Promise(resolve=>setTimeout(resolve,Math.max(0,readyAt-Date.now())));
  source=chooseLiveFrameSource({...camera,displayEnabled:true},tenant.id,{VDO_NINJA:()=>new VdoLiveFrameSource()}) as VdoLiveFrameSource;
  await source.open({...camera,displayEnabled:true});const frame=await source.capture();
  if(Date.parse(frame.capturedAt)<readyAt)throw new Error('early_frame');
  // The operator's saved orange ROI is authoritative for this manual, read-only test.
  // Do not gate OCR on a full-frame layout/detection pass.
  const saved=(await pool.query<NormalizedRoi>(
   'SELECT x,y,width,height FROM camera_ocr_roi WHERE camera_id=$1 AND oa_id=$2',[cameraId,tenant.id]
  )).rows[0];
  const image=`data:image/png;base64,${frame.image.toString('base64')}`;
  const dimensions={imageWidth:frame.width,imageHeight:frame.height};
  const common={image,capturedAt:frame.capturedAt,...dimensions,note:'PREVIEW_ONLY_NO_ROUND_NO_SETTLEMENT'};
  if(!validNormalizedRoi(saved))return Response.json({status:'REVIEW_REQUIRED',reason:'ocr_roi_not_saved',rawText:'',confidence:0,roi:null,...common},{headers});
  const roi=roiForFrame(saved,frame);
  const reading=await new TesseractOcrAdapter().read(frame,roi);
  const cropImage=`data:image/png;base64,${reading.crop.toString('base64')}`;
  const data={...common,roi,cropImage,rawText:reading.rawText,confidence:reading.confidence,attempts:reading.attempts};
  let number:string;
  try{number=validateScaleDisplay(reading.normalizedText)}
  catch{return Response.json({status:'REVIEW_REQUIRED',reason:'ambiguous_display',...data},{headers})}
  const lastDigit=extractLastDisplayedDigit(number),parity=determineParity(lastDigit);
  const reason=reading.conflict?'conflicting_ocr_results':
   reading.blurScore<defaultOcrConfig.minimumBlurScore?'blurry_image':
   reading.glareFraction>defaultOcrConfig.maximumGlareFraction?'glare':
   reading.confidence<defaultOcrConfig.minimumConfidence?'low_confidence':null;
  return Response.json({status:reason?'READ_UNVERIFIED':'READ',reason,number,lastDigit,parity,...data},{headers});
 }catch(error){return Response.json({error:error instanceof Error&&error.message==='early_frame'?'early_frame':'ocr_simulation_unavailable'},{status:503,headers})}
 finally{active.delete(cameraId);await source?.close().catch(()=>{})}
}
