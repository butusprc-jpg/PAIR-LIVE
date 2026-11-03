import 'server-only';
import {randomBytes} from 'node:crypto';
import {identityKey,tokenHash} from '../auth-core';
import type {VerifiedIdentity} from '../auth-core';
import {database} from './db';
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
export async function createMemberSession(memberId:string){
 const token=randomBytes(32).toString('base64url');
 await database().query("INSERT INTO member_sessions(token_hash,member_id,expires_at) VALUES($1,$2,now()+interval '12 hours')",[tokenHash(token),memberId]);
 return token;
}
export async function memberFromSession(token:string){
 const result=await database().query(`SELECT m.id,m.display_name,m.avatar_url,m.status,m.demo_points,i.provider,i.provider_user_id,i.provider_channel_id FROM member_sessions s JOIN members m ON m.id=s.member_id JOIN LATERAL (SELECT provider,provider_user_id,provider_channel_id FROM member_identities WHERE member_id=m.id ORDER BY last_login_at DESC LIMIT 1) i ON true WHERE s.token_hash=$1 AND s.expires_at>now()`,[tokenHash(token)]);
 const member=result.rows[0];return member?.status==='active'?member:null;
}
export async function revokeMemberSession(token:string){await database().query('DELETE FROM member_sessions WHERE token_hash=$1',[tokenHash(token)])}
export async function memberHistory(memberId:string){const client=await database().connect();try{await client.query('BEGIN');await client.query("SELECT set_config('pair_live.member_id',$1,true)",[memberId]);const r=await client.query('SELECT round_id,side,demo_points,result,created_at FROM member_history WHERE member_id=$1 ORDER BY created_at DESC LIMIT 100',[memberId]);await client.query('COMMIT');return r.rows}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
