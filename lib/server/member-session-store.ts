import {randomBytes} from 'node:crypto';
import type {Pool} from 'pg';
import {tokenHash} from '../auth-core';

type QueryStore=Pick<Pool,'query'>;
export const shortSessionSeconds=12*60*60;
export const rememberSessionSeconds=30*24*60*60;

export async function issueSession(db:QueryStore,memberId:string,remember=false){
 const token=randomBytes(32).toString('base64url');
 await db.query("INSERT INTO member_sessions(token_hash,member_id,expires_at,remember_session) VALUES($1,$2,now()+($3::int * interval '1 second'),$4)",[tokenHash(token),memberId,remember?rememberSessionSeconds:shortSessionSeconds,remember]);
 return token;
}
export async function rotateSession(db:QueryStore,token:string){
 const next=randomBytes(32).toString('base64url');
 const result=await db.query(`UPDATE member_sessions SET previous_token_hash=token_hash,previous_valid_until=LEAST(expires_at,now()+interval '2 minutes'),token_hash=$2,rotated_at=now()
 WHERE token_hash=$1 AND remember_session AND rotated_at<now()-interval '24 hours' AND expires_at>now()
 RETURNING expires_at`,[tokenHash(token),tokenHash(next)]);
 if(!result.rowCount)return null;
 return {token:next,maxAge:Math.max(1,Math.floor((new Date(result.rows[0].expires_at).getTime()-Date.now())/1000))};
}
export async function resolveSession(db:QueryStore,token:string){
 const result=await db.query(`SELECT m.id,m.display_name,m.avatar_url,m.status,m.demo_points,i.provider,i.provider_user_id,i.provider_channel_id FROM member_sessions s JOIN members m ON m.id=s.member_id JOIN LATERAL (SELECT provider,provider_user_id,provider_channel_id FROM member_identities WHERE member_id=m.id ORDER BY last_login_at DESC LIMIT 1) i ON true WHERE (s.token_hash=$1 OR (s.previous_token_hash=$1 AND s.previous_valid_until>now())) AND s.expires_at>now()`,[tokenHash(token)]);
 const member=result.rows[0];return member?.status==='active'?member:null;
}
export async function revokeSession(db:QueryStore,token:string){await db.query('DELETE FROM member_sessions WHERE token_hash=$1 OR (previous_token_hash=$1 AND previous_valid_until>now())',[tokenHash(token)])}
