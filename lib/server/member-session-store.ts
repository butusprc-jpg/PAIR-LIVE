import {randomBytes} from 'node:crypto';
import type {Pool} from 'pg';
import {tokenHash} from '../auth-core';

type QueryStore=Pick<Pool,'query'>;
export type SessionScope={provider:'line'|'wechat';channelId:string};
function scopedToken(scope:SessionScope){return `${Buffer.from(JSON.stringify([scope.provider,scope.channelId])).toString('base64url')}.${randomBytes(32).toString('base64url')}`}
function tokenScope(token:string):SessionScope|null{const [encoded,random,...rest]=token.split('.');if(rest.length||!encoded||!random||!/^[A-Za-z0-9_-]{43}$/.test(random))return null;try{const value:unknown=JSON.parse(Buffer.from(encoded,'base64url').toString());if(!Array.isArray(value)||value.length!==2||!['line','wechat'].includes(value[0])||typeof value[1]!=='string'||!value[1].trim())return null;return {provider:value[0],channelId:value[1]}}catch{return null}}
export function configuredSessionScopes():SessionScope[]{const scopes:SessionScope[]=[];for(const [provider,key] of [['line','LINE_LOGIN_CHANNEL_ID'],['wechat','WECHAT_APP_ID']] as const){const channelId=process.env[key]?.trim();if(channelId)scopes.push({provider,channelId})}return scopes}
export const shortSessionSeconds=12*60*60;
export const rememberSessionSeconds=30*24*60*60;
export function shouldRotateSession(member:{remember_session:boolean;rotated_at:Date|string},now=Date.now()){
 return member.remember_session&&new Date(member.rotated_at).getTime()<now-24*60*60*1000;
}

export async function issueSession(db:QueryStore,memberId:string,scope:SessionScope,remember=false){
 if(!scope.channelId.trim())throw new Error('session_channel_missing');
 const token=scopedToken(scope);
 await db.query("INSERT INTO member_sessions(token_hash,member_id,expires_at,remember_session) VALUES($1,$2,now()+($3::int * interval '1 second'),$4)",[tokenHash(token),memberId,remember?rememberSessionSeconds:shortSessionSeconds,remember]);
 return token;
}
export async function rotateSession(db:QueryStore,token:string){
 const scope=tokenScope(token);if(!scope||!configuredSessionScopes().some(value=>value.provider===scope.provider&&value.channelId===scope.channelId))return null;
 const next=scopedToken(scope);
 const result=await db.query(`UPDATE member_sessions SET previous_token_hash=token_hash,previous_valid_until=LEAST(expires_at,now()+interval '2 minutes'),token_hash=$2,rotated_at=now()
 WHERE token_hash=$1 AND remember_session AND rotated_at<now()-interval '24 hours' AND expires_at>now()
 RETURNING expires_at`,[tokenHash(token),tokenHash(next)]);
 if(!result.rowCount)return null;
 return {token:next,maxAge:Math.max(1,Math.floor((new Date(result.rows[0].expires_at).getTime()-Date.now())/1000))};
}
export async function resolveSession(db:QueryStore,token:string,allowedScopes:readonly SessionScope[]=configuredSessionScopes()){
 const scope=tokenScope(token);if(!scope||!allowedScopes.some(value=>value.provider===scope.provider&&value.channelId===scope.channelId))return null;
 const result=await db.query(`SELECT m.id,m.display_name,m.avatar_url,m.status,m.demo_points,i.provider,i.provider_user_id,i.provider_channel_id,s.remember_session,s.rotated_at FROM member_sessions s JOIN members m ON m.id=s.member_id JOIN member_identities i ON i.member_id=m.id AND i.provider=$2 AND i.provider_channel_id=$3 WHERE (s.token_hash=$1 OR (s.previous_token_hash=$1 AND s.previous_valid_until>now())) AND s.expires_at>now()`,[tokenHash(token),scope.provider,scope.channelId]);
 const member=result.rows[0];return member?.status==='active'?member:null;
}
export async function revokeSession(db:QueryStore,token:string){await db.query('DELETE FROM member_sessions WHERE token_hash=$1 OR (previous_token_hash=$1 AND previous_valid_until>now())',[tokenHash(token)])}
