import 'server-only';
import {OwnerError} from './errors';
export {OwnerError} from './errors';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {database} from '../server/db';
import {verifyLineAccessToken} from '../auth-core';
import {sameOrigin} from '../server/auth-http';
import {emailSession} from './email-auth';
const sessionCookie='pair_owner_session',challengeCookie='pair_owner_csrf';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const token=()=>randomBytes(32).toString('base64url');
const secure=()=>process.env.NODE_ENV==='production';
function cookie(name:string,value:string,maxAge:number){return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure()?'; Secure':''}`}
function readCookie(request:Request,name:string){return request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||''}
function equal(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
function configured(){const channel=process.env.LINE_LOGIN_CHANNEL_ID,owner=process.env.OWNER_LINE_USER_ID;if(!channel||!owner||!/^U[0-9a-f]{32}$/i.test(owner))throw new OwnerError('owner_not_configured',503);return {channel,owner}}
export async function ownerAccess(request:Request,mutation=false,allowPending=false){const raw=readCookie(request,sessionCookie);if(!/^[A-Za-z0-9_-]{43}$/.test(raw))throw new OwnerError('owner_session_invalid',401);
 const result=await database().query<{provider_channel_id:string;provider_user_id:string}>(`SELECT provider_channel_id,provider_user_id FROM owner_sessions WHERE token_hash=$1 AND expires_at>now()`,[hash(raw)]);
 const row=result.rows[0];if(!row)throw new OwnerError('owner_session_invalid',401);if(row.provider_channel_id==='owner-email'){const account=await emailSession(request);if(account.mustChangePassword&&!allowPending)throw new OwnerError('password_change_required',403)}else{const {channel,owner}=configured();if(row.provider_channel_id!==channel||row.provider_user_id!==owner)throw new OwnerError('owner_forbidden')}
 if(mutation){if(!sameOrigin(request))throw new OwnerError('csrf_origin');const csrf=readCookie(request,challengeCookie),header=request.headers.get('x-owner-csrf')||'';if(!csrf||!equal(csrf,header))throw new OwnerError('csrf_invalid');const used=await database().query(`DELETE FROM owner_csrf_challenges WHERE token_hash=$1 AND session_hash=$2 AND expires_at>now() RETURNING token_hash`,[hash(csrf),hash(raw)]);if(!used.rowCount)throw new OwnerError('csrf_invalid')}
 return {channelId:row.provider_channel_id,userId:row.provider_user_id,sessionHash:hash(raw)};
}
export async function ownerChallenge(request:Request){if(!sameOrigin(request))throw new OwnerError('csrf_origin');const purpose=(await request.json().catch(()=>({}))).purpose;if(purpose!=='login'&&purpose!=='mutation')throw new OwnerError('request_invalid',400);const session=purpose==='mutation'?await ownerAccess(request,false,true):null;const value=token();await database().query(`INSERT INTO owner_csrf_challenges(token_hash,session_hash,expires_at) VALUES($1,$2,now()+interval '2 minutes')`,[hash(value),session?.sessionHash||null]);return Response.json({ok:true,csrfToken:value},{headers:{'Set-Cookie':cookie(challengeCookie,value,120),'Cache-Control':'no-store'}})}
export async function ownerLogin(request:Request){const {channel,owner}=configured();if(!sameOrigin(request))throw new OwnerError('csrf_origin');const csrf=readCookie(request,challengeCookie),header=request.headers.get('x-owner-csrf')||'';if(!csrf||!equal(csrf,header))throw new OwnerError('csrf_invalid');const used=await database().query(`DELETE FROM owner_csrf_challenges WHERE token_hash=$1 AND session_hash IS NULL AND expires_at>now() RETURNING token_hash`,[hash(csrf)]);if(!used.rowCount)throw new OwnerError('csrf_invalid');const data=await request.json().catch(()=>({}));if(typeof data.accessToken!=='string'||data.accessToken.length>8192)throw new OwnerError('identity_invalid',401);let identity;try{identity=await verifyLineAccessToken(data.accessToken,channel)}catch{throw new OwnerError('identity_invalid',401)}if(identity.provider!=='line'||identity.providerUserId!==owner||identity.providerChannelId!==channel)throw new OwnerError('owner_forbidden');const value=token();await database().query(`INSERT INTO owner_sessions(token_hash,provider_channel_id,provider_user_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')`,[hash(value),channel,owner]);return Response.json({ok:true},{headers:{'Set-Cookie':cookie(sessionCookie,value,3600),'Cache-Control':'no-store'}})}
export function ownerFailure(error:unknown){const e=error instanceof OwnerError?error:new OwnerError('owner_unavailable',503);return Response.json({error:e.code},{status:e.status,headers:{'Cache-Control':'no-store'}})}
