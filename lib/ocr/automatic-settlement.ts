import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {candidateImageKeys,type CandidateImageStorage} from './candidate-image-storage';
import {validatePng} from './evidence';
import {settleVerifiedRound} from '../rounds/settlement';

type Candidate={id:string;round_id:string;oa_id:string;camera_id:string;source_kind:string;source_id:string;frame_id:string;captured_at:Date;full_text:string;last_digit:string;parity:string;confidence:string;original_sha256:string;crop_sha256:string;original_object_key:string;crop_object_key:string;status:string;locked_oa_id:string;locked_camera_id:string;locked_sha256:string;locked_text:string;locked_digit:string;locked_parity:string;locked_confidence:string;first_captured_at:Date;last_captured_at:Date;frame_count:number;locked_at:Date;round_status:string;closed_at:Date;closes_at:Date;settlement_oa_id:string;camera_source_kind:string;current_source_id:string;display_enabled:boolean;line_oa_id:string;oa_enabled:boolean;oa_paused:boolean;oa_expires_at:Date;verified_token_hash:string;configured_by:string|null};

async function markReview(pool:Pool,roundId:string,reason:string){const client=await pool.connect();try{await client.query('BEGIN');const changed=await client.query("UPDATE rounds SET status='REVIEW_REQUIRED' WHERE id=$1 AND epoch_id=current_round_epoch_id() AND status='SCANNING' RETURNING id",[roundId]);if(changed.rowCount)await client.query("INSERT INTO round_audit_logs(round_id,actor,action,details) VALUES($1,'ocr-worker','OCR_REVIEW_REQUIRED',jsonb_build_object('reason',$2::text))",[roundId,reason]);await client.query('COMMIT')}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
export async function reviewMissingOcrEvidence(pool:Pool,roundId:string,reason:string){if(!/^\d{1,18}$/.test(roundId)||!['candidate_image_missing','candidate_image_integrity_failed','candidate_storage_not_configured'].includes(reason))throw new Error('invalid_ocr_review_reason');await markReview(pool,roundId,reason)}

/** Promotes only the server's immutable, three-second candidate and its present private images. */
export async function verifyCandidateEvidence(pool:Pool,roundId:string,storage:CandidateImageStorage){
 if(!/^\d{1,18}$/.test(roundId))throw new Error('invalid_round_id');
 const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(74021601)');
  const row=(await client.query<Candidate>(`SELECT i.*,l.oa_id AS locked_oa_id,l.camera_id AS locked_camera_id,l.last_frame_sha256 AS locked_sha256,l.full_text AS locked_text,l.last_digit AS locked_digit,l.parity AS locked_parity,l.confidence AS locked_confidence,l.first_captured_at,l.last_captured_at,l.frame_count,l.locked_at,
   r.status AS round_status,r.closed_at,r.closes_at,r.settlement_oa_id,c.source_kind AS camera_source_kind,
   CASE WHEN c.slot=1 THEN v.stream_id ELSE c.stream_id END AS current_source_id,
   CASE WHEN c.slot=1 THEN v.display_enabled ELSE c.display_enabled END AS display_enabled,
   o.line_oa_id,o.enabled AS oa_enabled,o.paused AS oa_paused,o.expires_at AS oa_expires_at,o.verified_token_hash,sc.configured_by
   FROM round_ocr_candidate_images i JOIN round_ocr_candidate_locks l ON l.round_id=i.round_id
   JOIN rounds r ON r.id=i.round_id AND r.epoch_id=current_round_epoch_id()
   JOIN oa_service_control o ON o.id=i.oa_id
   JOIN site_cameras c ON c.camera_id=i.camera_id AND c.oa_id=i.oa_id
   LEFT JOIN vdo_ninja_tenants v ON v.oa_id=c.oa_id AND c.slot=1
   LEFT JOIN round_settlement_config sc ON sc.round_id=r.id AND sc.oa_id=i.oa_id
   WHERE i.round_id=$1 FOR UPDATE OF r,i`,[roundId])).rows[0];
  if(!row||row.round_status!=='SCANNING'||row.status!=='AVAILABLE'||!row.closed_at||new Date(row.closes_at)>new Date()||row.oa_id!==row.settlement_oa_id||!row.configured_by)throw new Error('candidate_not_ready');
  const token=process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
  if(!token||row.line_oa_id!==process.env.CONNECTED_LINE_OA_ID||row.verified_token_hash!==createHash('sha256').update(token).digest('hex')||!row.oa_enabled||row.oa_paused||new Date(row.oa_expires_at)<=new Date())throw new Error('candidate_oa_invalid');
  const originalSha=row.original_sha256.trim(),cropSha=row.crop_sha256.trim();
  const keys=candidateImageKeys(row.oa_id,roundId,originalSha,cropSha);
  if(row.oa_id!==row.locked_oa_id||row.camera_id!==row.locked_camera_id||originalSha!==row.locked_sha256.trim()||row.source_kind!==row.camera_source_kind||row.source_id!==(row.current_source_id??row.camera_id)||!row.display_enabled||row.original_object_key!==keys.full||row.crop_object_key!==keys.crop||row.full_text!==row.locked_text||row.last_digit!==row.locked_digit||row.parity!==row.locked_parity||Number(row.confidence)!==Number(row.locked_confidence)||row.frame_count<5||new Date(row.last_captured_at).getTime()-new Date(row.first_captured_at).getTime()<3000||new Date(row.captured_at).getTime()!==new Date(row.last_captured_at).getTime()||new Date(row.captured_at)<new Date(row.closed_at)||new Date(row.captured_at).getTime()>Date.now()+1000||!/^(?:\d+)(?:\.\d+)?$/.test(row.full_text)||row.last_digit!==row.full_text.at(-1)||row.parity!==(/[02468]/.test(row.last_digit)?'EVEN':'ODD'))throw new Error('candidate_metadata_invalid');
  const full=await storage.get(keys.full),crop=await storage.get(keys.crop);
  if(!full||!crop||validatePng(full)!==originalSha||validatePng(crop)!==cropSha)throw new Error('candidate_image_missing');
  const existing=(await client.query<{id:string;normalized_text:string}>(`SELECT id,normalized_text FROM round_ocr_evidence WHERE candidate_image_id=$1`,[row.id])).rows[0];
  if(existing&&existing.normalized_text!==row.full_text)throw new Error('candidate_evidence_conflict');
  const evidenceId=existing?.id??(await client.query<{id:string}>(`INSERT INTO round_ocr_evidence(round_id,frame_id,source_type,captured_at,raw_ocr_text,normalized_text,confidence,original_sha256,crop_sha256,original_object_key,crop_object_key,candidate_image_id)
   VALUES($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,[roundId,row.frame_id,row.source_kind,row.captured_at,row.full_text,row.confidence,originalSha,cropSha,keys.full,keys.crop,row.id])).rows[0].id;
  const decision=(await client.query<{decision:string}>('SELECT decision FROM round_ocr_verification_decisions WHERE evidence_id=$1',[evidenceId])).rows[0];
  if(decision&&decision.decision!=='VERIFIED')throw new Error('candidate_evidence_conflict');
  if(!decision)await client.query("INSERT INTO round_ocr_verification_decisions(evidence_id,decision,actor) VALUES($1,'VERIFIED','ocr-worker')",[evidenceId]);
  await client.query('COMMIT');return {candidateImageId:row.id,adminId:row.configured_by,evidenceId};
 }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}

export async function settleOcrCandidate(pool:Pool,roundId:string,storage:CandidateImageStorage):ReturnType<typeof settleVerifiedRound>{
 if(process.env.OCR_AUTO_SETTLEMENT_ENABLED!=='true')throw new Error('ocr_auto_settlement_gate_closed');
 if(!/^\d{1,18}$/.test(roundId))throw new Error('invalid_round_id');
 const settled=(await pool.query<{status:string;configured_by:string}>("SELECT r.status,c.configured_by FROM rounds r JOIN round_settlement_config c ON c.round_id=r.id WHERE r.id=$1 AND r.epoch_id=current_round_epoch_id()",[roundId])).rows[0];
 if(settled?.status==='SETTLED')return settleVerifiedRound(pool,settled.configured_by,roundId);
 try{const verified=await verifyCandidateEvidence(pool,roundId,storage);return await settleVerifiedRound(pool,verified.adminId,roundId,{candidateImageId:verified.candidateImageId,storage})}
 catch(error){const code=error instanceof Error?error.message:'candidate_unknown';if(code==='candidate_not_ready'){const current=(await pool.query<{status:string;configured_by:string}>("SELECT r.status,c.configured_by FROM rounds r JOIN round_settlement_config c ON c.round_id=r.id WHERE r.id=$1 AND r.epoch_id=current_round_epoch_id()",[roundId])).rows[0];if(current?.status==='SETTLED')return settleVerifiedRound(pool,current.configured_by,roundId)}if(['candidate_not_ready','candidate_oa_invalid','candidate_metadata_invalid','candidate_image_missing','candidate_image_integrity_failed','candidate_evidence_conflict'].includes(code))await markReview(pool,roundId,code);throw error}
}
