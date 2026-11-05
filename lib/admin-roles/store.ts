import type {Pool,PoolClient} from 'pg';
import type {AdminRole} from '../../modules/admin-auth/types';

export class AdminRoleError extends Error{constructor(public code:string,public status=400){super(code)}}
const roles=['admin','operator','viewer'] as const;
export function validRole(value:unknown):value is AdminRole{return roles.includes(value as AdminRole)}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function transaction<T>(pool:Pool,fn:(client:PoolClient)=>Promise<T>){const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(74021605)');const value=await fn(c);await c.query('COMMIT');return value}catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}}
async function actorRow(c:PoolClient,actorId:string){
 const result=await c.query("SELECT id,role,status FROM admin_identities WHERE id=$1 FOR UPDATE",[actorId]);const actor=result.rows[0];
 if(!actor||actor.status!=='active')throw new AdminRoleError('admin_forbidden',403);
 // A pre-migration session may still obtain its role from the bootstrap allowlist.
 if(actor.role===null)await c.query("UPDATE admin_identities SET role='admin',updated_at=now() WHERE id=$1 AND role IS NULL",[actorId]);
 else if(actor.role!=='admin')throw new AdminRoleError('admin_forbidden',403);
}
export async function listAdminRoles(pool:Pool){const [admins,audit]=await Promise.all([
 pool.query("SELECT id,display_name,avatar_url,role,status,created_at,updated_at FROM admin_identities ORDER BY created_at DESC,id DESC LIMIT 100"),
 pool.query("SELECT a.id,a.actor_id,a.target_id,a.action,a.previous_role,a.next_role,a.previous_status,a.next_status,a.created_at,actor.display_name AS actor_name,target.display_name AS target_name FROM admin_role_audit a JOIN admin_identities actor ON actor.id=a.actor_id JOIN admin_identities target ON target.id=a.target_id ORDER BY a.created_at DESC,a.id DESC LIMIT 100")]);return {admins:admins.rows,audit:audit.rows}}
export async function eligibleLineMembers(pool:Pool,channel:string,search:string){if(search.length>100)throw new AdminRoleError('invalid_search');const result=await pool.query(`SELECT i.id AS member_identity_id,m.display_name,i.last_login_at,
 (SELECT a.id FROM admin_identities a WHERE a.provider='line' AND a.provider_channel_id=i.provider_channel_id AND a.provider_user_id=i.provider_user_id) AS admin_id
 FROM member_identities i JOIN members m ON m.id=i.member_id
 WHERE i.provider='line' AND i.provider_channel_id=$1 AND m.status='active' AND m.display_name ILIKE '%'||$2||'%' ORDER BY i.last_login_at DESC,i.id DESC LIMIT 30`,[channel,search]);return result.rows}
export async function addAdminRole(pool:Pool,actorId:string,memberIdentityId:string,role:AdminRole,channel:string){
 if(!uuid.test(memberIdentityId)||!validRole(role))throw new AdminRoleError('invalid_request');
 return transaction(pool,async c=>{
  await actorRow(c,actorId);
  const candidate=(await c.query("SELECT i.provider_user_id,m.display_name,m.avatar_url FROM member_identities i JOIN members m ON m.id=i.member_id WHERE i.id=$1 AND i.provider='line' AND i.provider_channel_id=$2 AND m.status='active' FOR SHARE OF i,m",[memberIdentityId,channel])).rows[0];
  if(!candidate)throw new AdminRoleError('verified_line_identity_not_found',404);
  const prior=(await c.query("SELECT id,role,status FROM admin_identities WHERE provider='line' AND provider_channel_id=$1 AND provider_user_id=$2 FOR UPDATE",[channel,candidate.provider_user_id])).rows[0];
  if(prior?.role||prior?.status==='disabled')throw new AdminRoleError('admin_already_exists',409);
  const target=prior?(await c.query('UPDATE admin_identities SET role=$2,updated_at=now() WHERE id=$1 RETURNING id',[prior.id,role])).rows[0]:
   (await c.query("INSERT INTO admin_identities(provider,provider_channel_id,provider_user_id,display_name,avatar_url,role) VALUES('line',$1,$2,$3,$4,$5) RETURNING id",[channel,candidate.provider_user_id,candidate.display_name,candidate.avatar_url,role])).rows[0];
  await c.query("INSERT INTO admin_role_audit(actor_id,target_id,action,previous_role,next_role,previous_status,next_status) VALUES($1,$2,'added',$3,$4,$5,'active')",[actorId,target.id,prior?.role??null,role,prior?.status??null]);
  return {id:target.id,role,status:'active'};
 });
}
export async function updateAdminRole(pool:Pool,actorId:string,targetId:string,change:{role?:AdminRole;status?:'active'|'disabled'}){
 if(!uuid.test(targetId)||(!change.role&&!change.status)||change.role!==undefined&&!validRole(change.role)||change.status!==undefined&&!['active','disabled'].includes(change.status))throw new AdminRoleError('invalid_request');
 return transaction(pool,async c=>{
  await actorRow(c,actorId);
  if(actorId===targetId)throw new AdminRoleError('self_role_change_forbidden',409);
  const current=(await c.query('SELECT id,role,status FROM admin_identities WHERE id=$1 FOR UPDATE',[targetId])).rows[0];
  if(!current)throw new AdminRoleError('admin_not_found',404);
  const nextRole=change.role??current.role,nextStatus=change.status??current.status;
  if(!validRole(nextRole))throw new AdminRoleError('admin_role_not_set',409);
  if(current.role===nextRole&&current.status===nextStatus)return {id:targetId,role:nextRole,status:nextStatus,replayed:true};
  if(current.role==='admin'&&current.status==='active'&&(nextRole!=='admin'||nextStatus!=='active')){
   const count=(await c.query("SELECT count(*)::int AS n FROM admin_identities WHERE role='admin' AND status='active'")).rows[0].n;
   if(count<=1)throw new AdminRoleError('last_admin_required',409);
  }
  await c.query('UPDATE admin_identities SET role=$2,status=$3,updated_at=now() WHERE id=$1',[targetId,nextRole,nextStatus]);
  if(nextStatus==='disabled')await c.query('UPDATE admin_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE admin_id=$1 AND revoked_at IS NULL',[targetId]);
  const action=current.status!==nextStatus?(nextStatus==='disabled'?'disabled':'enabled'):'role_changed';
  await c.query('INSERT INTO admin_role_audit(actor_id,target_id,action,previous_role,next_role,previous_status,next_status) VALUES($1,$2,$3,$4,$5,$6,$7)',[actorId,targetId,action,current.role,nextRole,current.status,nextStatus]);
  return {id:targetId,role:nextRole,status:nextStatus,replayed:false};
 });
}
