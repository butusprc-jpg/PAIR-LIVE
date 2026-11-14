import type {Pool} from 'pg';
import {createHash} from 'node:crypto';
import type {LiveCamera,LiveFrameAdapterFactory,LiveSourceKind,NormalizedRoi} from './live-frame-source';
import {chooseLiveFrameSource} from './live-frame-source';
import {scanStableLiveNumber} from './stable-live-scan';
import type {OcrAdapter} from './core';
import {candidateImageKeys,configuredCandidateImageStorage,type CandidateImageStorage} from './candidate-image-storage';
import {validatePng} from './evidence';

type Row={id:string;status:string;closed_at:Date|null;closes_at:Date;settlement_oa_id:string|null;cameraId:string;oaId:string;siteId:string;sourceKind:LiveSourceKind;streamId:string|null;displayEnabled:boolean;cameraRevision:string;roiRevision:string;x:number;y:number;width:number;height:number;oa_enabled:boolean;oa_paused:boolean;oa_deleted_at:Date|null;oa_expires_at:Date;line_oa_id:string;verified_token_hash:string|null};
export type CandidateResult={status:'LOCKED';replayed:boolean;text:string;lastDigit:string;parity:string}|{status:'REVIEW_REQUIRED';reason:string};

/** Internal-only candidate scan; never writes verification decisions, points or LINE outbox. */
export async function lockRoundOcrCandidate(pool:Pool,roundId:string,factories:Partial<Record<LiveSourceKind,LiveFrameAdapterFactory>>,engine:OcrAdapter,storage:CandidateImageStorage|null=configuredCandidateImageStorage()):Promise<CandidateResult>{
 if(!/^\d{1,18}$/.test(roundId))throw new Error('invalid_round_id');
 if(!storage)throw new Error('candidate_storage_not_configured');
 const prior=(await pool.query<{full_text:string;last_digit:string;parity:string;image_id:string|null;original_object_key:string|null;crop_object_key:string|null}>(`SELECT l.full_text,l.last_digit,l.parity,i.id AS image_id,i.original_object_key,i.crop_object_key FROM round_ocr_candidate_locks l LEFT JOIN round_ocr_candidate_images i ON i.round_id=l.round_id AND i.status='AVAILABLE' WHERE l.round_id=$1`,[roundId])).rows[0];
 if(prior){if(!prior.image_id||!prior.original_object_key||!prior.crop_object_key||!await storage.get(prior.original_object_key)||!await storage.get(prior.crop_object_key))throw new Error('candidate_image_missing');return {status:'LOCKED',replayed:true,text:prior.full_text,lastDigit:prior.last_digit,parity:prior.parity}}
 const rows=(await pool.query<Row>(`SELECT r.id,r.status,r.closed_at,r.closes_at,r.settlement_oa_id,c.camera_id AS "cameraId",c.oa_id AS "oaId",c.site_id AS "siteId",c.source_kind AS "sourceKind",
  CASE WHEN c.slot=1 THEN v.stream_id ELSE c.stream_id END AS "streamId",CASE WHEN c.slot=1 THEN v.display_enabled ELSE c.display_enabled END AS "displayEnabled",
  c.revision AS "cameraRevision",roi.revision AS "roiRevision",roi.x,roi.y,roi.width,roi.height,o.enabled AS oa_enabled,o.paused AS oa_paused,o.deleted_at AS oa_deleted_at,o.expires_at AS oa_expires_at,o.line_oa_id,o.verified_token_hash
  FROM rounds r JOIN oa_service_control o ON o.id=r.settlement_oa_id
  JOIN site_cameras c ON c.oa_id=o.id JOIN camera_ocr_roi roi ON roi.camera_id=c.camera_id AND roi.oa_id=c.oa_id
  LEFT JOIN vdo_ninja_tenants v ON v.oa_id=c.oa_id AND c.slot=1
  WHERE r.id=$1 AND r.epoch_id=current_round_epoch_id() AND (CASE WHEN c.slot=1 THEN v.display_enabled ELSE c.display_enabled END)=true
  ORDER BY c.slot LIMIT 2`,[roundId])).rows;
 if(rows.length!==1)throw new Error(rows.length?'ocr_camera_ambiguous':'ocr_camera_or_roi_missing');
 const row=rows[0],token=process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
 if(row.status!=='SCANNING'||!row.closed_at||new Date(row.closes_at)>new Date()||!row.oa_enabled||row.oa_paused||row.oa_deleted_at||new Date(row.oa_expires_at)<=new Date()||!row.settlement_oa_id||row.oaId!==row.settlement_oa_id||!token||row.line_oa_id!==process.env.CONNECTED_LINE_OA_ID||row.verified_token_hash!==createHash('sha256').update(token).digest('hex'))throw new Error('round_not_closed_for_ocr');
 const camera:LiveCamera={cameraId:row.cameraId,oaId:row.oaId,siteId:row.siteId,sourceKind:row.sourceKind,streamId:row.streamId,displayEnabled:row.displayEnabled};
 const roi:NormalizedRoi={x:row.x,y:row.y,width:row.width,height:row.height};
 const source=chooseLiveFrameSource(camera,row.settlement_oa_id,factories);
 const outcome=await scanStableLiveNumber({roundId,status:row.status,closedAt:new Date(row.closed_at).toISOString(),oaId:row.settlement_oa_id,camera,roi},source,engine);
 const client=await pool.connect();try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(74021601)');
  const current=(await client.query('SELECT status,closed_at,settlement_oa_id FROM rounds WHERE id=$1 AND epoch_id=current_round_epoch_id() FOR UPDATE',[roundId])).rows[0];
  const existing=(await client.query<{full_text:string;last_digit:string;parity:string;image_id:string|null}>(`SELECT l.full_text,l.last_digit,l.parity,i.id AS image_id FROM round_ocr_candidate_locks l LEFT JOIN round_ocr_candidate_images i ON i.round_id=l.round_id AND i.status='AVAILABLE' WHERE l.round_id=$1`,[roundId])).rows[0];
  if(existing&&!existing.image_id)throw new Error('candidate_image_missing');
  if(existing){await client.query('COMMIT');return {status:'LOCKED',replayed:true,text:existing.full_text,lastDigit:existing.last_digit,parity:existing.parity}}
  if(!current||current.status!=='SCANNING'||new Date(current.closed_at).getTime()!==new Date(row.closed_at).getTime()||current.settlement_oa_id!==row.settlement_oa_id)throw new Error('round_changed_during_ocr');
  const config=(await client.query(`SELECT c.revision AS camera_revision,roi.revision AS roi_revision,
   CASE WHEN c.slot=1 THEN v.stream_id ELSE c.stream_id END AS stream_id,
   CASE WHEN c.slot=1 THEN v.display_enabled ELSE c.display_enabled END AS display_enabled
   FROM site_cameras c JOIN camera_ocr_roi roi ON roi.camera_id=c.camera_id AND roi.oa_id=c.oa_id
   LEFT JOIN vdo_ninja_tenants v ON v.oa_id=c.oa_id AND c.slot=1 WHERE c.camera_id=$1 AND c.oa_id=$2`,[camera.cameraId,camera.oaId])).rows[0];
  if(!config||String(config.camera_revision)!==String(row.cameraRevision)||String(config.roi_revision)!==String(row.roiRevision)||config.stream_id!==camera.streamId||!config.display_enabled)throw new Error('ocr_configuration_changed');
  if(outcome.status==='LOCKED'){
   const lock=outcome.lock,reading=outcome.reading;
   const originalSha256=validatePng(reading.frame.image),cropSha256=validatePng(reading.crop);
   if(originalSha256!==lock.lastFrameSha256||reading.frame.capturedAt!==lock.lastCapturedAt||reading.normalizedText!==lock.text||reading.frame.roundId!==roundId)throw new Error('candidate_frame_mismatch');
   const keys=candidateImageKeys(camera.oaId,roundId,originalSha256,cropSha256);
   await storage.putImmutable(keys.full,reading.frame.image);
   try{await storage.putImmutable(keys.crop,reading.crop)}catch(error){await storage.remove(keys.full).catch(()=>{});throw error}
   await client.query(`INSERT INTO round_ocr_candidate_locks(round_id,oa_id,camera_id,full_text,last_digit,parity,confidence,first_captured_at,last_captured_at,frame_count,last_frame_sha256)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[roundId,camera.oaId,camera.cameraId,lock.text,lock.lastDigit,lock.parity,lock.confidence,lock.firstCapturedAt,lock.lastCapturedAt,lock.frameIds.length,lock.lastFrameSha256]);
   await client.query(`INSERT INTO round_ocr_candidate_images(round_id,oa_id,camera_id,source_kind,source_id,frame_id,captured_at,full_text,last_digit,parity,confidence,original_sha256,crop_sha256,original_object_key,crop_object_key,original_bytes,crop_bytes)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,[roundId,camera.oaId,camera.cameraId,camera.sourceKind,camera.streamId??camera.cameraId,reading.frame.id,reading.frame.capturedAt,lock.text,lock.lastDigit,lock.parity,lock.confidence,originalSha256,cropSha256,keys.full,keys.crop,reading.frame.image.length,reading.crop.length]);
   await client.query("INSERT INTO round_audit_logs(round_id,actor,action,details) VALUES($1,'ocr-worker','OCR_CANDIDATE_LOCKED',jsonb_build_object('camera_id',$2::uuid,'text',$3::text,'last_digit',$4::text,'parity',$5::text))",[roundId,camera.cameraId,lock.text,lock.lastDigit,lock.parity]);
   await client.query('COMMIT');return {status:'LOCKED',replayed:false,text:lock.text,lastDigit:lock.lastDigit,parity:lock.parity};
  }
  await client.query("UPDATE rounds SET status='REVIEW_REQUIRED' WHERE id=$1 AND status='SCANNING'",[roundId]);
  await client.query("INSERT INTO round_audit_logs(round_id,actor,action,details) VALUES($1,'ocr-worker','OCR_REVIEW_REQUIRED',jsonb_build_object('reason',$2::text))",[roundId,outcome.reason]);
  await client.query('COMMIT');return outcome;
 }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
