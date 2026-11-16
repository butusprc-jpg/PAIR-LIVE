import type {PoolClient} from 'pg';

/** The round close time, not the worker tick, is the countdown deadline. */
export function automaticCountdownDue(opensAt:Date,closesAt:Date,now:Date){
 return now>=opensAt&&now<closesAt&&now.getTime()>=closesAt.getTime()-60_000;
}

/** Called while the round row and round-engine advisory lock are held. */
export async function startAutomaticCountdown(client:PoolClient,row:Record<string,unknown>,now:Date){
 if(row.status!=='OPEN'||row.countdown_started_at||!automaticCountdownDue(new Date(String(row.opens_at)),new Date(String(row.closes_at)),now))return row;
 const changed=await client.query("UPDATE rounds SET countdown_started_at=clock_timestamp(),countdown_ends_at=closes_at WHERE id=$1 AND status='OPEN' AND countdown_started_at IS NULL RETURNING *",[row.id]);
 if(!changed.rows[0])return row;
 await client.query("SELECT set_config('pair_live.countdown_dispatch','true',true)");
 await client.query(`INSERT INTO round_countdown_line_outbox(round_id,member_id,oa_id,recipient_user_id)
  SELECT $1,p.member_id,$2,i.provider_user_id FROM member_countdown_line_preferences p
  JOIN members m ON m.id=p.member_id AND m.status='active'
  JOIN LATERAL (SELECT provider_user_id FROM member_identities WHERE member_id=p.member_id AND provider='line' AND provider_channel_id=$3 ORDER BY last_login_at DESC LIMIT 1) i ON true
  WHERE p.enabled=true AND i.provider_user_id ~ '^U[0-9a-fA-F]{32}$' ON CONFLICT DO NOTHING`,[row.id,row.settlement_oa_id,process.env.LINE_LOGIN_CHANNEL_ID??'']);
 await client.query("INSERT INTO round_audit_logs(round_id,actor,action,details) SELECT id,'engine','COUNTDOWN_STARTED',jsonb_build_object('duration_seconds',greatest(0,extract(epoch FROM (closes_at-countdown_started_at))::int),'automatic',true) FROM rounds WHERE id=$1",[row.id]);
 return changed.rows[0];
}
