import type {Pool} from 'pg';

export type ResultAnnouncement={roundId:string;lastDigit:string;confirmedAt:string;status:'CONFIRMED'};
export const RESULT_ANNOUNCEMENT_MS=10_000;

export function visibleResultAnnouncement(value:unknown,now:number):ResultAnnouncement|null{
 if(!value||typeof value!=='object'||!Number.isFinite(now))return null;
 const item=value as Record<string,unknown>;
 if(item.status!=='CONFIRMED'||typeof item.roundId!=='string'||!/^\d+$/.test(item.roundId)||typeof item.lastDigit!=='string'||!/^\d$/.test(item.lastDigit)||typeof item.confirmedAt!=='string')return null;
 const at=Date.parse(item.confirmedAt);
 return Number.isFinite(at)&&now>=at&&now<at+RESULT_ANNOUNCEMENT_MS?item as ResultAnnouncement:null;
}

export async function readResultAnnouncement(pool:Pool){
 const result=await pool.query<{round_id:string;last_digit:string;confirmed_at:Date;server_time:Date}>(`SELECT r.id::text AS round_id,i.last_digit,d.decided_at AS confirmed_at,clock_timestamp() AS server_time
  FROM rounds r JOIN round_ocr_candidate_images i ON i.round_id=r.id AND i.status='AVAILABLE'
  JOIN round_ocr_evidence e ON e.candidate_image_id=i.id AND e.round_id=r.id
  JOIN round_ocr_verification_decisions d ON d.evidence_id=e.id AND d.decision='VERIFIED'
  JOIN admin_identities a ON a.id::text=d.actor AND a.role='admin' AND a.status='active'
  WHERE r.epoch_id=current_round_epoch_id() AND r.status='SCANNING' AND r.closed_at IS NOT NULL
  AND e.normalized_text=i.full_text AND e.original_sha256=i.original_sha256 AND e.crop_sha256=i.crop_sha256
  AND e.original_object_key=i.original_object_key AND e.crop_object_key=i.crop_object_key
  AND e.captured_at>=r.closed_at+interval '3 seconds' AND i.last_digit ~ '^[0-9]$'
  AND NOT EXISTS (SELECT 1 FROM round_ocr_evidence other JOIN round_ocr_verification_decisions od ON od.evidence_id=other.id AND od.decision='VERIFIED' WHERE other.round_id=r.id AND other.id<>e.id)
  AND d.decided_at<=clock_timestamp() AND d.decided_at>clock_timestamp()-interval '10 seconds'
  ORDER BY d.decided_at DESC LIMIT 1`);
 const row=result.rows[0];
 return {announcement:row?{roundId:row.round_id,lastDigit:row.last_digit,confirmedAt:new Date(row.confirmed_at).toISOString(),status:'CONFIRMED' as const}:null,serverTime:(row?.server_time??new Date()).toISOString()};
}
