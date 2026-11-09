import 'server-only';
import {identityKey} from '../auth-core';
import type {VerifiedIdentity} from '../auth-core';
import {database} from './db';
import {issueSession,resolveSession,revokeSession,rotateSession} from './member-session-store';
export async function resolveMember(identity:VerifiedIdentity){
 const db=database(),client=await db.connect();
 try{
  await client.query('BEGIN');
  // The unique provider/channel/user key and transaction advisory lock serialize first logins.
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[identityKey(identity)]);
  const found=await client.query(`SELECT m.id,m.status FROM member_identities i JOIN members m ON m.id=i.member_id WHERE i.provider=$1 AND i.provider_channel_id=$2 AND i.provider_user_id=$3 FOR UPDATE OF m`,[identity.provider,identity.providerChannelId,identity.providerUserId]);
  let id:string;
  if(found.rows.length){
   if(found.rows[0].status!=='active')throw new Error('member_suspended');
   id=found.rows[0].id;
   await client.query('UPDATE members SET display_name=$1,avatar_url=$2,updated_at=now() WHERE id=$3',[identity.displayName,identity.avatarUrl,id]);
   await client.query('UPDATE member_identities SET last_login_at=now() WHERE provider=$1 AND provider_channel_id=$2 AND provider_user_id=$3',[identity.provider,identity.providerChannelId,identity.providerUserId]);
  }else{
   const created=await client.query('INSERT INTO members(display_name,avatar_url) VALUES($1,$2) RETURNING id',[identity.displayName,identity.avatarUrl]);id=created.rows[0].id;
   await client.query('INSERT INTO member_identities(member_id,provider,provider_user_id,provider_channel_id) VALUES($1,$2,$3,$4)',[id,identity.provider,identity.providerUserId,identity.providerChannelId]);
  }
  await client.query('COMMIT');return id;
 }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
export async function createMemberSession(memberId:string,remember=false){return issueSession(database(),memberId,remember)}
export async function rotateMemberSession(token:string){return rotateSession(database(),token)}
export async function memberFromSession(token:string){return resolveSession(database(),token)}
export async function revokeMemberSession(token:string){return revokeSession(database(),token)}
export async function memberHistory(memberId:string){const client=await database().connect();try{await client.query('BEGIN');await client.query("SELECT set_config('pair_live.member_id',$1,true)",[memberId]);const r=await client.query("SELECT round_id,side,demo_points,result,created_at FROM member_history WHERE member_id=$1 AND CASE WHEN round_id ~ '^[0-9]+$' THEN round_id::bigint END IN (SELECT id FROM rounds WHERE epoch_id=current_round_epoch_id()) ORDER BY created_at DESC LIMIT 100",[memberId]);await client.query('COMMIT');return r.rows}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
