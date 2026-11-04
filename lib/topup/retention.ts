import {DeleteObjectCommand} from '@aws-sdk/client-s3';
import type {Pool} from 'pg';
import {storage} from './qr';
import {TopupError} from './store';

export type CleanupResult={claimed:number;purged:number;retried:number;notifications:number;events:number};
export async function cleanupTopupTemporary(pool:Pool,deleteObject?:(key:string)=>Promise<void>,now=new Date()):Promise<CleanupResult>{
 const result:CleanupResult={claimed:0,purged:0,retried:0,notifications:0,events:0};
 const c=await pool.connect();
 const scoped=async<T>(fn:()=>Promise<T>)=>{await c.query('BEGIN');try{await c.query("SELECT set_config('pair_live.topup_admin','true',true)");const v=await fn();await c.query('COMMIT');return v}catch(e){await c.query('ROLLBACK');throw e}};
 try{
  const rows=await scoped(async()=>{const claim=await c.query<{request_id:string;object_key:string;attempts:number}>(`WITH due AS (
   SELECT request_id FROM member_topup_slip_retention
   WHERE expires_at<=$1 AND next_attempt_at<=$1 AND legal_hold=false
    AND (state IN ('ACTIVE','RETRY') OR (state='PROCESSING' AND lease_until<$1))
   ORDER BY expires_at,request_id FOR UPDATE SKIP LOCKED LIMIT 50
  ) UPDATE member_topup_slip_retention s SET state='PROCESSING', attempts=s.attempts+1,
    lease_until=$1::timestamptz+interval '2 minutes'
   FROM due WHERE s.request_id=due.request_id RETURNING s.request_id,s.object_key,s.attempts`,[now]);return claim.rows});
  result.claimed=rows.length;
  for(const row of rows){
   try{
    await c.query('BEGIN');
    await c.query("SELECT set_config('pair_live.topup_admin','true',true)");
    const current=await c.query('SELECT legal_hold,state FROM member_topup_slip_retention WHERE request_id=$1 FOR UPDATE',[row.request_id]);
    if(current.rows[0]?.legal_hold||current.rows[0]?.state!=='PROCESSING'){await c.query('ROLLBACK');continue}
    if(!/^topup-slips\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i.test(row.object_key))throw new TopupError('invalid_slip_key');
    if(deleteObject)await deleteObject(row.object_key);
    else {const {bucket,client}=storage();await client.send(new DeleteObjectCommand({Bucket:bucket,Key:row.object_key}))}
    await c.query(`UPDATE member_topup_slip_retention SET state='PURGED',purged_at=$2,lease_until=NULL,last_error=NULL
      WHERE request_id=$1 AND state='PROCESSING' AND legal_hold=false`,[row.request_id,now]);
    await c.query('COMMIT');result.purged++;
   }catch(error){
    try{await c.query('ROLLBACK')}catch{}
    const code=error instanceof TopupError?error.code:'r2_delete_failed';
    await scoped(async()=>{await c.query(`UPDATE member_topup_slip_retention SET state='RETRY',lease_until=NULL,
     next_attempt_at=$2::timestamptz+least(3600,power(2,least(attempts,10))::integer*30)*interval '1 second',last_error=$3
     WHERE request_id=$1 AND state='PROCESSING'`,[row.request_id,now,code])});result.retried++;
   }
  }
  const temporary=await scoped(async()=>{
   // Keep linked webhook event IDs: the immutable chat-action audit references them.
   const n=await c.query(`DELETE FROM member_topup_line_notifications WHERE
    (status IN ('SENT','FAILED') AND updated_at<=$1::timestamptz-interval '24 hours')
    OR (status IN ('PENDING','RETRY','PROCESSING') AND created_at<=$1::timestamptz-interval '24 hours')`,[now]);
   const e=await c.query(`DELETE FROM line_webhook_events e WHERE e.created_at<=$1::timestamptz-interval '24 hours'
    AND e.event_type='postback' AND e.processing_status='PROCESSED' AND NOT EXISTS(SELECT 1 FROM member_topup_chat_actions a WHERE a.event_id=e.event_id)`,[now]);
   return {notifications:n.rowCount||0,events:e.rowCount||0};
  });Object.assign(result,temporary);
  return result;
 }finally{c.release()}
}
