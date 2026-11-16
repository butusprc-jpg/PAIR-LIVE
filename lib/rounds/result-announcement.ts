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
 const result=await pool.query<{round_id:string;last_digit:string;confirmed_at:Date;server_time:Date}>(`SELECT r.id::text AS round_id,r.result_last_digit AS last_digit,r.settled_at AS confirmed_at,clock_timestamp() AS server_time
  FROM rounds r WHERE r.epoch_id=current_round_epoch_id() AND r.status='SETTLED'
  AND r.result_verified_at IS NOT NULL AND r.settled_at IS NOT NULL
  AND r.result_last_digit ~ '^[0-9]$'
  AND EXISTS (SELECT 1 FROM round_ocr_evidence e WHERE e.round_id=r.id AND e.normalized_text=r.result_number AND e.verification_status='VERIFIED' AND e.verified_at IS NOT NULL)
  AND r.settled_at<=clock_timestamp() AND r.settled_at>clock_timestamp()-interval '10 seconds'
  ORDER BY r.settled_at DESC LIMIT 1`);
 const row=result.rows[0];
 return {announcement:row?{roundId:row.round_id,lastDigit:row.last_digit,confirmedAt:new Date(row.confirmed_at).toISOString(),status:'CONFIRMED' as const}:null,serverTime:(row?.server_time??new Date()).toISOString()};
}
