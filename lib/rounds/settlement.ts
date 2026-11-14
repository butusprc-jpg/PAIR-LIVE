import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {RoundError} from './core';
import {walletPathFromDatabase} from '../server/wallet-cutover';
import {applyWalletMutationWithClient} from '../../modules/member-wallet/server/postgres';
import {resultParity} from '../line/game-notices';
import {roundAwardPoints} from './payout';
import type {CandidateImageStorage} from '../ocr/candidate-image-storage';
import {validatePng} from '../ocr/evidence';

/** Internal-only. The existing OCR confirmation route is closed; no public caller is installed. */
export async function settleVerifiedRound(pool:Pool,adminId:string,roundId:string,automatic?:{candidateImageId:string;storage:CandidateImageStorage}){
 if(!/^[0-9a-f-]{36}$/i.test(adminId)||!/^\d+$/.test(roundId))throw new RoundError('invalid_settlement_input',400);
 const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock_shared(74021602)');await client.query('SELECT pg_advisory_xact_lock(74021601)');
  const round=(await client.query('SELECT * FROM rounds WHERE id=$1 AND epoch_id=current_round_epoch_id() FOR UPDATE',[roundId])).rows[0];
  if(!round)throw new RoundError('round_not_found',404);
  const admin=(await client.query("SELECT id FROM admin_identities WHERE id=$1 AND provider='line' AND provider_channel_id=$2 AND status='active' AND role IN ('admin','operator')",[adminId,process.env.LINE_LOGIN_CHANNEL_ID])).rows[0];
  if(!admin)throw new RoundError('admin_forbidden',403);
  const token=process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN,oa=process.env.CONNECTED_LINE_OA_ID;
  if(!token||!oa)throw new RoundError('oa_binding_unverified',503);
  const config=(await client.query(`SELECT c.rate_numerator,c.rate_denominator,c.oa_id FROM round_settlement_config c JOIN oa_service_control o ON o.id=c.oa_id
   WHERE c.round_id=$1 AND o.line_oa_id=$2 AND o.enabled=true AND o.paused=false AND o.deleted_at IS NULL AND o.expires_at>now() AND o.verified_token_hash=$3 FOR SHARE OF c,o`,[roundId,oa,createHash('sha256').update(token).digest('hex')])).rows[0];
  if(!config)throw new RoundError('settlement_rate_or_oa_missing',409);
  if(!round.settlement_oa_id||String(round.settlement_oa_id)!==String(config.oa_id))throw new RoundError('round_oa_mismatch',409);
  if(round.status==='SETTLED'){await client.query('COMMIT');return {roundId,status:'SETTLED',replayed:true,resultNumber:String(round.result_number),parity:String(round.result_parity),awards:0}}
  if(!['SCANNING','REVIEW_REQUIRED'].includes(round.status)||!round.closed_at||new Date(round.closes_at)>new Date())throw new RoundError('round_not_ready_for_settlement',409);
  const pointsPath=await walletPathFromDatabase(client);
  if(automatic&&pointsPath!=='legacy')throw new RoundError('automatic_legacy_only',409);
  const evidence=(await client.query(`SELECT e.id,e.normalized_text,e.confidence,e.candidate_image_id,e.source_type,e.original_object_key,e.crop_object_key,e.original_sha256,e.crop_sha256,
   i.oa_id AS image_oa_id,i.round_id AS image_round_id,i.status AS image_status,i.full_text AS image_text,i.source_kind AS image_source_kind,i.original_sha256 AS image_original_sha256,i.crop_sha256 AS image_crop_sha256
   FROM round_ocr_evidence e JOIN round_ocr_verification_decisions d ON d.evidence_id=e.id
   LEFT JOIN round_ocr_candidate_images i ON i.id=e.candidate_image_id
   WHERE e.round_id=$1 AND d.decision='VERIFIED' AND e.source_type IN ('IP_CAMERA','NVR_DVR','CLOUD_CAMERA','VDO_NINJA','RTSP_GATEWAY') ORDER BY e.id FOR SHARE OF e,d`,[roundId])).rows;
  if(evidence.length!==1)throw new RoundError('verified_result_missing_or_ambiguous',409);
  if(automatic){const item=evidence[0];if(item.candidate_image_id!==automatic.candidateImageId||item.image_status!=='AVAILABLE'||String(item.image_round_id)!==roundId||item.image_oa_id!==config.oa_id||item.image_text!==item.normalized_text||item.image_source_kind!==item.source_type||item.original_sha256!==item.image_original_sha256||item.crop_sha256!==item.image_crop_sha256)throw new RoundError('candidate_evidence_mismatch',409);
   const full=await automatic.storage.get(item.original_object_key),crop=await automatic.storage.get(item.crop_object_key);
   if(!full||!crop||validatePng(full)!==String(item.original_sha256).trim()||validatePng(crop)!==String(item.crop_sha256).trim())throw new RoundError('candidate_image_missing',409);
  }
  const resultNumber=String(evidence[0].normalized_text);
  if(!/^\d+(?:\.\d+)?$/.test(resultNumber))throw new RoundError('invalid_verified_result',409);
  const parity=resultParity(resultNumber)==='even'?'EVEN':'ODD';const lastDigit=resultNumber.at(-1)!;
  let entries=0,awards=0;
  for(const {id:memberId} of (await client.query('SELECT id FROM members ORDER BY id')).rows){
   await client.query("SELECT set_config('pair_live.member_id',$1,true)",[memberId]);
   const rows=(await client.query("SELECT * FROM round_entries WHERE round_id=$1 AND member_id=$2 AND status='PENDING' ORDER BY id FOR UPDATE",[roundId,memberId])).rows;
   for(const entry of rows){entries++;
    const identities=(await client.query("SELECT provider_channel_id,provider_user_id FROM member_identities WHERE member_id=$1 AND provider='line' ORDER BY last_login_at DESC",[memberId])).rows;
    if(identities.length&&!identities.some(identity=>identity.provider_channel_id===process.env.LINE_LOGIN_CHANNEL_ID))throw new RoundError('entry_member_oa_mismatch',409);
    if(pointsPath==='wallet'){
     const use=(await client.query("SELECT id,points FROM member_wallet_ledger WHERE member_id=$1 AND reference_id=$2 AND type='DEMO_USE'",[memberId,`ROUND_${roundId}_${entry.idempotency_key}`])).rows[0];
     if(!use||Number(use.points)!==Number(entry.demo_points))throw new RoundError('original_wallet_use_missing',409);
    }else{
     const accepted=(await client.query("SELECT id FROM round_audit_logs WHERE round_id=$1 AND action='DEMO_ENTRY_ACCEPTED' AND details->>'entry_id'=$2 LIMIT 1",[roundId,entry.id])).rows[0];
     if(!accepted)throw new RoundError('original_legacy_entry_missing',409);
    }
    const correct=entry.side.toUpperCase()===parity;
    if(correct){const points=roundAwardPoints(Number(entry.demo_points),Number(config.rate_numerator),Number(config.rate_denominator));
     if(pointsPath==='wallet'){
      const credited=await applyWalletMutationWithClient(client,{memberId,type:'DEMO_GRANT',points,referenceId:`ROUND_AWARD_${entry.id}`,idempotencyKey:`round-award:${entry.id}`,actor:adminId,source:'round'});
      if(credited.replayed)throw new RoundError('settlement_state_conflict',409);
      await client.query('INSERT INTO round_settlement_awards(entry_id,round_id,member_id,credited_points,wallet_ledger_id) VALUES($1,$2,$3,$4,$5)',[entry.id,roundId,memberId,points,credited.entry.id]);
     }else{
      const updated=(await client.query('UPDATE members SET demo_points=demo_points+$1,updated_at=clock_timestamp() WHERE id=$2 RETURNING demo_points',[points,memberId])).rows[0];
      if(!updated)throw new RoundError('member_unavailable',409);
      const after=Number(updated.demo_points),before=after-points;
      if(!Number.isSafeInteger(after)||before<0)throw new RoundError('legacy_balance_invalid',409);
      const ledger=(await client.query('INSERT INTO round_legacy_award_ledger(entry_id,round_id,member_id,points,balance_before,balance_after,actor) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[entry.id,roundId,memberId,points,before,after,adminId])).rows[0];
      await client.query('INSERT INTO round_settlement_awards(entry_id,round_id,member_id,credited_points,legacy_ledger_id) VALUES($1,$2,$3,$4,$5)',[entry.id,roundId,memberId,points,ledger.id]);
     }
     awards++;
    }
    const changed=await client.query('UPDATE round_entries SET status=$3 WHERE id=$1 AND member_id=$2 AND status=\'PENDING\' RETURNING id',[entry.id,memberId,correct?'CORRECT':'INCORRECT']);
    if(changed.rowCount!==1)throw new RoundError('settlement_state_conflict',409);
    const recipient=identities.find(identity=>identity.provider_channel_id===process.env.LINE_LOGIN_CHANNEL_ID&&/^U[0-9a-f]{32}$/i.test(identity.provider_user_id))?.provider_user_id??null;
    await client.query(`INSERT INTO round_result_line_outbox(entry_id,round_id,member_id,oa_id,recipient_user_id,status,last_error)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(entry_id) DO NOTHING`,[entry.id,roundId,memberId,config.oa_id,recipient,recipient?'PENDING':'UNDELIVERABLE',recipient?null:'line_identity_missing']);
   }
  }
  await client.query("SELECT set_config('pair_live.member_id','',true)");
  if(entries!==Number(round.even_people)+Number(round.odd_people))throw new RoundError('round_entries_mismatch',409);
  await client.query(`UPDATE rounds SET status='SETTLED',settled_at=clock_timestamp(),result_number=$2,result_last_digit=$3,result_parity=$4,result_confidence=$5,result_verified_at=clock_timestamp() WHERE id=$1`,[roundId,resultNumber,lastDigit,parity,evidence[0].confidence]);
  await client.query("INSERT INTO round_audit_logs(round_id,actor,action,details) VALUES($1,$2,'ROUND_SETTLED',jsonb_build_object('evidence_id',$3::bigint,'entries',$4::int,'awards',$5::int,'rate_numerator',$6::int,'rate_denominator',$7::int,'rounding','FLOOR_PER_ENTRY','points_path',$8::text))",[roundId,automatic?'ocr-worker':adminId,evidence[0].id,entries,awards,config.rate_numerator,config.rate_denominator,pointsPath]);
  await client.query('COMMIT');return {roundId,status:'SETTLED',replayed:false,resultNumber,parity,awards};
 }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
