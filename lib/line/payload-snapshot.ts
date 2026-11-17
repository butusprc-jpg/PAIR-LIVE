import type {PoolClient} from 'pg';
import {t} from '../i18n';
import {recipientLocale} from './locale';
import {liveStartCard,countdownStartCard} from './start-cards';
import {resultNoticeCard} from './game-notices';

function renderMessages(render:()=>unknown[]):string|null{try{return JSON.stringify(render())}catch{return null}}

/** Called inside the event transaction, or for an unattempted legacy row under its claim lock. */
export async function snapshotLiveStart(c:PoolClient,eventId:string,memberId?:string){
 const rows=(await c.query<{event_id:string;member_id:string;shop_name:string|null;notification_locale:string}>(`
  SELECT o.event_id,o.member_id,e.shop_name,m.notification_locale FROM live_start_line_outbox o
  JOIN live_start_line_events e ON e.id=o.event_id JOIN members m ON m.id=o.member_id
  WHERE o.event_id=$1 AND ($2::uuid IS NULL OR o.member_id=$2) AND o.payload_messages IS NULL AND o.attempts=0`,[eventId,memberId??null])).rows;
 for(const row of rows){const locale=recipientLocale(row.notification_locale);
  const payload=renderMessages(()=>[liveStartCard(row.shop_name,locale)]);
  if(!payload){await c.query(`UPDATE live_start_line_outbox SET status='FAILED',attempts=5,last_error='payload_render_failed' WHERE event_id=$1 AND member_id=$2 AND payload_messages IS NULL AND attempts=0`,[row.event_id,row.member_id]);continue}
  await c.query(`UPDATE live_start_line_outbox SET payload_locale=$3,payload_messages=$4::jsonb WHERE event_id=$1 AND member_id=$2 AND payload_messages IS NULL AND attempts=0`,[row.event_id,row.member_id,locale,payload]);}
}

export async function snapshotCountdown(c:PoolClient,roundId:string,memberId?:string){
 const rows=(await c.query<{round_id:string;member_id:string;duration_seconds:number;notification_locale:string}>(`
  SELECT o.round_id,o.member_id,extract(epoch FROM (r.countdown_ends_at-r.countdown_started_at))::int AS duration_seconds,m.notification_locale
  FROM round_countdown_line_outbox o JOIN rounds r ON r.id=o.round_id JOIN members m ON m.id=o.member_id
  WHERE o.round_id=$1 AND ($2::uuid IS NULL OR o.member_id=$2) AND o.payload_messages IS NULL AND o.attempts=0`,[roundId,memberId??null])).rows;
 for(const row of rows){const locale=recipientLocale(row.notification_locale);
  const payload=renderMessages(()=>[countdownStartCard(String(row.round_id),Number(row.duration_seconds),locale)]);
  if(!payload){await c.query(`UPDATE round_countdown_line_outbox SET status='FAILED',attempts=5,last_error='payload_render_failed' WHERE round_id=$1 AND member_id=$2 AND payload_messages IS NULL AND attempts=0`,[row.round_id,row.member_id]);continue}
  await c.query(`UPDATE round_countdown_line_outbox SET payload_locale=$3,payload_messages=$4::jsonb WHERE round_id=$1 AND member_id=$2 AND payload_messages IS NULL AND attempts=0`,[row.round_id,row.member_id,locale,payload]);}
}

export async function snapshotResult(c:PoolClient,roundId:string,entryId?:string){
 const rows=(await c.query<{entry_id:string;round_id:string;result_number:string;side:'even'|'odd';demo_points:number;entry_status:'CORRECT'|'INCORRECT';credited_points:number|null;notification_locale:string}>(`
  SELECT o.entry_id,o.round_id,r.result_number,e.side,e.demo_points,e.status AS entry_status,a.credited_points,m.notification_locale
  FROM round_result_line_outbox o JOIN rounds r ON r.id=o.round_id JOIN round_entries e ON e.id=o.entry_id
  JOIN members m ON m.id=o.member_id LEFT JOIN round_settlement_awards a ON a.entry_id=o.entry_id
  WHERE o.round_id=$1 AND ($2::uuid IS NULL OR o.entry_id=$2) AND o.payload_messages IS NULL AND o.attempts=0 AND o.recipient_user_id IS NOT NULL`,[roundId,entryId??null])).rows;
 for(const row of rows){const locale=recipientLocale(row.notification_locale);
  const payload=renderMessages(()=>[resultNoticeCard({roundId:String(row.round_id),resultNumber:row.result_number,chosenSide:row.side,stakePoints:Number(row.demo_points),outcome:row.entry_status,creditedPoints:row.entry_status==='CORRECT'?Number(row.credited_points):0},locale)]);
  if(!payload){await c.query(`UPDATE round_result_line_outbox SET status='UNDELIVERABLE',attempts=5,last_error='payload_render_failed' WHERE entry_id=$1 AND payload_messages IS NULL AND attempts=0`,[row.entry_id]);continue}
  await c.query(`UPDATE round_result_line_outbox SET payload_locale=$2,payload_messages=$3::jsonb WHERE entry_id=$1 AND payload_messages IS NULL AND attempts=0`,[row.entry_id,locale,payload]);}
}

export async function snapshotApprovedTopup(c:PoolClient,requestId:string){
 const row=(await c.query<{notification_locale:string;approved_points:number}>(`
  SELECT m.notification_locale,n.approved_points FROM member_topup_member_notifications n
  JOIN members m ON m.id=n.member_id WHERE n.request_id=$1 AND n.payload_messages IS NULL AND n.attempts=0 AND n.recipient_user_id IS NOT NULL`,[requestId])).rows[0];
 if(!row)return;
 const locale=recipientLocale(row.notification_locale);
 const payload=renderMessages(()=>[{type:'text',text:t('line.topup.approved',locale,{points:row.approved_points})}]);
 if(!payload){await c.query(`UPDATE member_topup_member_notifications SET status='FAILED',attempts=5,last_error='payload_render_failed' WHERE request_id=$1 AND payload_messages IS NULL AND attempts=0`,[requestId]);return}
 await c.query(`UPDATE member_topup_member_notifications SET payload_locale=$2,payload_messages=$3::jsonb WHERE request_id=$1 AND payload_messages IS NULL AND attempts=0`,[requestId,locale,payload]);
}

export async function snapshotWithdrawal(c:PoolClient,requestId:string,purpose?:'MEMBER_TRANSFERRED'|'MEMBER_REJECTED'){
 const rows=(await c.query<{id:string;request_id:string;purpose:'MEMBER_TRANSFERRED'|'MEMBER_REJECTED';requested_points:number;debit_timing:string;notification_locale:string}>(`
  SELECT o.id,o.request_id,o.purpose,r.requested_points,r.debit_timing,m.notification_locale
  FROM member_withdrawal_line_outbox o JOIN member_withdrawal_requests r ON r.id=o.request_id JOIN members m ON m.id=r.member_id
  WHERE o.request_id=$1 AND ($2::text IS NULL OR o.purpose=$2) AND o.purpose IN ('MEMBER_TRANSFERRED','MEMBER_REJECTED')
   AND o.payload_messages IS NULL AND o.attempts=0`,[requestId,purpose??null])).rows;
 for(const row of rows){const locale=recipientLocale(row.notification_locale);
  const key=row.purpose==='MEMBER_TRANSFERRED'?'line.withdraw.transferred':row.debit_timing==='PREDEBIT'?'line.withdraw.rejectedRefund':'line.withdraw.rejected';
  const payload=renderMessages(()=>[{type:'text',text:t(key,locale,{points:row.requested_points,reference:row.request_id})}]);
  if(!payload){await c.query(`UPDATE member_withdrawal_line_outbox SET status='FAILED',attempts=5,last_error='payload_render_failed' WHERE id=$1 AND payload_messages IS NULL AND attempts=0`,[row.id]);continue}
  await c.query(`UPDATE member_withdrawal_line_outbox SET payload_locale=$2,payload_messages=$3::jsonb WHERE id=$1 AND payload_messages IS NULL AND attempts=0`,[row.id,locale,payload]);}
}
