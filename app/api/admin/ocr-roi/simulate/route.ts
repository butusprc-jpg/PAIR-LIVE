import {adminAccess,adminDenied} from '../../../../../lib/server/admin-auth';
import {database} from '../../../../../lib/server/db';
import {resolveVdoTenant} from '../../../../../modules/external-live/server/vdo-ninja';
import {chooseLiveFrameSource,type LiveCamera} from '../../../../../lib/ocr/live-frame-source';
import {VdoLiveFrameSource} from '../../../../../lib/ocr/vdo-live-frame-source';
import {TesseractOcrAdapter} from '../../../../../lib/ocr/engine';
import {analyzeOneShotFrame} from '../../../../../lib/ocr/one-shot-scan';
import {previewGuess} from '../../../../../lib/ocr/preview-guess';

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
  const result=await analyzeOneShotFrame(frame,new TesseractOcrAdapter());
  const image=`data:image/png;base64,${frame.image.toString('base64')}`;
  const dimensions={imageWidth:frame.width,imageHeight:frame.height};
  if(result.status==='LOCKED')return Response.json({status:'READ',number:result.text,lastDigit:result.lastDigit,parity:result.parity,confidence:result.confidence,rawText:result.reading.rawText,roi:result.roi,image,capturedAt:frame.capturedAt,...dimensions},{headers});
  const guess=previewGuess(result);
  if(guess)return Response.json({...guess,rawText:result.rawText??'',image,capturedAt:frame.capturedAt,...dimensions,note:'PREVIEW_ONLY_NO_ROUND_NO_SETTLEMENT'},{headers});
  return Response.json({status:'REVIEW_REQUIRED',reason:result.reason,rawText:result.rawText??'',confidence:result.confidence??0,roi:result.roi??null,image,capturedAt:frame.capturedAt,...dimensions},{headers});
 }catch(error){return Response.json({error:error instanceof Error&&error.message==='early_frame'?'early_frame':'ocr_simulation_unavailable'},{status:503,headers})}
 finally{active.delete(cameraId);await source?.close().catch(()=>{})}
}
