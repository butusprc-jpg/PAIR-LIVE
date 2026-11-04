import type {Pool,PoolClient} from 'pg';
import {walletPathFromDatabase} from '../server/wallet-cutover';
export class TopupError extends Error {constructor(public code:string,public status=400){super(code)}}
export function maximumPoints(){const n=Number(process.env.TOPUP_MAX_POINTS||100000);if(!Number.isSafeInteger(n)||n<1||n>2147483647)throw new TopupError('topup_configuration_invalid',503);return n}
export function validatePoints(n:unknown){if(typeof n!=='number'||!Number.isSafeInteger(n)||n<1||n>maximumPoints())throw new TopupError('invalid_points');return n}
export function uuid(s:unknown):s is string{return typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)}
async function transaction<T>(pool:Pool,member:string|null,fn:(c:PoolClient)=>Promise<T>){const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('pair_live.member_id',$1,true),set_config('pair_live.topup_admin',$2,true)",[member||'',member?'false':'true']);const result=await fn(c);await c.query('COMMIT');return result}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
export function createTopup(pool:Pool,memberId:string,points:unknown,key:unknown){validatePoints(points);if(!uuid(key))throw new TopupError('invalid_idempotency_key');return transaction(pool,memberId,async c=>{const m=await c.query('SELECT status FROM members WHERE id=$1 FOR UPDATE',[memberId]);if(m.rows[0]?.status!=='active')throw new TopupError('member_suspended',403);const inserted=await c.query('INSERT INTO member_topup_requests(member_id,requested_points,idempotency_key) VALUES($1,$2,$3) ON CONFLICT(member_id,idempotency_key) DO NOTHING RETURNING *',[memberId,points,key]);const row=inserted.rows[0]||(await c.query('SELECT * FROM member_topup_requests WHERE member_id=$1 AND idempotency_key=$2',[memberId,key])).rows[0];if(row.requested_points!==points)throw new TopupError('idempotency_conflict',409);return row})}
export function createTopupWithSlip(pool:Pool,memberId:string,points:unknown,key:unknown,slip:{objectKey:string;type:string;sha:string},recipients:readonly string[]=[]){
 validatePoints(points);
 if(!uuid(key)||!slip.objectKey.startsWith('topup-slips/'+memberId+'/'+key)||!['image/png','image/jpeg','image/webp'].includes(slip.type)||!/^[0-9a-f]{64}$/.test(slip.sha))throw new TopupError('invalid_slip',400);
 return transaction(pool,memberId,async c=>{
  const m=await c.query('SELECT status FROM members WHERE id=$1 FOR UPDATE',[memberId]);
  if(m.rows[0]?.status!=='active')throw new TopupError('member_suspended',403);
  const result=await c.query('INSERT INTO member_topup_requests(member_id,requested_points,idempotency_key,slip_object_key,slip_content_type,slip_sha256) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(member_id,idempotency_key) DO NOTHING RETURNING *',[memberId,points,key,slip.objectKey,slip.type,slip.sha]);
  const row=result.rows[0]||(await c.query('SELECT * FROM member_topup_requests WHERE member_id=$1 AND idempotency_key=$2',[memberId,key])).rows[0];
  if(!row||row.requested_points!==points||row.slip_sha256!==slip.sha||row.slip_object_key!==slip.objectKey)throw new TopupError('idempotency_conflict',409);
  if(result.rows.length)await c.query("INSERT INTO member_topup_slip_retention(request_id,object_key,expires_at) VALUES($1,$2,$3::timestamptz + interval '24 hours')",[row.id,slip.objectKey,row.created_at]);
  // Enqueue only on first INSERT, atomically with the new topup request.
  // An idempotent replay must not create another LINE notification.
  if(result.rows.length){
   for(const userId of new Set(recipients)){
    if(!/^U[0-9a-f]{32}$/i.test(userId))throw new TopupError('invalid_line_recipient');
    await c.query('INSERT INTO member_topup_line_notifications(request_id,member_id,recipient_user_id) VALUES($1,$2,$3) ON CONFLICT(request_id,recipient_user_id) DO NOTHING',[row.id,memberId,userId]);
   }
  }
  return row;
 });
}
export function listTopups(pool:Pool,memberId:string|null,search='',status='',from?:string,to?:string){if(status&&!['PENDING','APPROVED','REJECTED'].includes(status))throw new TopupError('invalid_status');return transaction(pool,memberId,async c=>(await c.query(`SELECT r.id,r.member_id,r.requested_points,r.status,r.created_at,r.admin_note,(r.slip_object_key IS NOT NULL) AS has_slip,CASE WHEN sr.state='PURGED' THEN 'PURGED' WHEN sr.expires_at<=now() OR (sr.request_id IS NULL AND r.slip_object_key IS NOT NULL AND r.created_at<=now()-interval '24 hours') THEN 'EXPIRED' WHEN r.slip_object_key IS NOT NULL THEN 'ACTIVE' ELSE 'NONE' END AS slip_state,m.display_name,COALESCE((SELECT string_agg(DISTINCT provider,', ') FROM member_identities WHERE member_id=m.id),'') AS provider FROM member_topup_requests r JOIN members m ON m.id=r.member_id LEFT JOIN member_topup_slip_retention sr ON sr.request_id=r.id WHERE ($1::uuid IS NULL OR r.member_id=$1) AND ($2='' OR r.status=$2) AND ($3='' OR r.id::text=$3 OR m.display_name ILIKE '%'||$3||'%') AND ($4::timestamptz IS NULL OR r.created_at >= $4) AND ($5::timestamptz IS NULL OR r.created_at < $5) ORDER BY r.created_at DESC,r.id LIMIT 100`,[memberId,status,search.slice(0,200),from||null,to||null])).rows)}
// Caller must authenticate the session and current allowlist on every mutation.
export function decideTopup(pool:Pool,adminId:string,id:unknown,action:unknown,note:unknown){if(!uuid(id)||!['APPROVED','REJECTED'].includes(String(action))||typeof note!=='string'||note.length>1000)throw new TopupError('invalid_decision');return transaction(pool,null,async c=>{
 const admin=await c.query("SELECT id FROM admin_identities WHERE id=$1 AND status='active' FOR SHARE",[adminId]);if(!admin.rowCount)throw new TopupError('admin_forbidden',403);
 const r=(await c.query('SELECT * FROM member_topup_requests WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!r)throw new TopupError('not_found',404);
 if(r.status!== 'PENDING'){if(r.status===action)return {...r,replayed:true};throw new TopupError('terminal_status',409)}
 if(await walletPathFromDatabase(c)!=='legacy')throw new TopupError('legacy_required',409);
 const m=(await c.query('SELECT status,demo_points FROM members WHERE id=$1 FOR UPDATE',[r.member_id])).rows[0];if(!m||action==='APPROVED'&&m.status!=='active')throw new TopupError('member_suspended',403);if(action==='APPROVED')validatePoints(r.requested_points);
 const before=m.demo_points;const after=action==='APPROVED'?before+r.requested_points:before;if(!Number.isSafeInteger(after)||after>2147483647)throw new TopupError('balance_overflow',409);
 if(action==='APPROVED')await c.query('UPDATE members SET demo_points=$1,updated_at=now() WHERE id=$2',[after,r.member_id]);
 await c.query('INSERT INTO member_topup_audit(request_id,member_id,admin_id,action,points,balance_before,balance_after,admin_note) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,r.member_id,adminId,action,r.requested_points,before,after,note]);
 const field=action==='APPROVED'?'approved':'rejected';return {...(await c.query(`UPDATE member_topup_requests SET status=$1,${field}_by=$2,${field}_at=now(),admin_note=$3 WHERE id=$4 RETURNING *`,[action,adminId,note,id])).rows[0],replayed:false};
 })}
