import 'server-only';
import {scryptSync, randomBytes, timingSafeEqual, createHash} from 'node:crypto';
import {database} from '../server/db';
import {OwnerError} from './errors';
import {sameOrigin} from '../server/auth-http';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const newToken=()=>randomBytes(32).toString('base64url');
const cookie=(name:string,value:string,maxAge:number)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV==='production'?'; Secure':''}`;
const readCookie=(request:Request,name:string)=>request.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(name+'='))?.slice(name.length+1)||'';
const equals=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)};
const validEmail=(v:unknown)=>typeof v==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)&&v.length<=254&&v===v.toLowerCase();
const passPolicy=(v:unknown)=>typeof v==='string'&&v.length>=12&&v.length<=128&&/[A-Za-z]/.test(v)&&/[0-9]/.test(v);
type Account={email:string;password_salt:string;password_hash:string;must_change_password:boolean;failed_attempts:number;locked_until:Date|null};
export async function derivePassword(password:string,salt:string){return scryptSync(password,Buffer.from(salt,'hex'),64).toString('hex')}
async function csrf(request:Request,sessionHash:string|null){if(!sameOrigin(request))throw new OwnerError('csrf_origin');const csrfCookie=readCookie(request,'pair_owner_csrf'),csrfHeader=request.headers.get('x-owner-csrf')||'';if(!csrfCookie||!equals(csrfCookie,csrfHeader))throw new OwnerError('csrf_invalid');const deleted=await database().query('DELETE FROM owner_csrf_challenges WHERE token_hash=$1 AND session_hash IS NOT DISTINCT FROM $2 AND expires_at>now() RETURNING token_hash',[hash(csrfCookie),sessionHash]);if(!deleted.rowCount)throw new OwnerError('csrf_invalid')}
export async function emailLogin(request:Request){
 if(Number(request.headers.get('content-length')||0)>2048)throw new OwnerError('request_too_large',413);
 const body=await request.json().catch(()=>({}));
 if(!validEmail(body.email)||typeof body.password!=='string'||body.password.length>128)throw new OwnerError('identity_invalid',401);
 await csrf(request,null);
 const client=await database().connect();
 try{
  await client.query('BEGIN');
  const a=(await client.query<Account>('SELECT * FROM owner_email_accounts WHERE email=$1 FOR UPDATE',[body.email])).rows[0];
  // Always perform a password hash to avoid a fast unknown-account path.
  const computed=await derivePassword(body.password,a?.password_salt||'00000000000000000000000000000000');
  const correct=!!a&&equals(computed,a.password_hash);
  if(!a||!correct||a.locked_until&&new Date(a.locked_until)>new Date()){
   if(a){await client.query(`UPDATE owner_email_accounts SET failed_attempts=failed_attempts+1,locked_until=CASE WHEN failed_attempts+1>=5 THEN now()+interval '15 minutes' ELSE locked_until END WHERE email=$1`,[a.email])}
   await client.query('COMMIT');throw new OwnerError('identity_invalid',401);
  }
  await client.query('UPDATE owner_email_accounts SET failed_attempts=0,locked_until=NULL WHERE email=$1',[a.email]);
  const token=newToken();
  await client.query(`INSERT INTO owner_sessions(token_hash,provider_channel_id,provider_user_id,expires_at) VALUES($1,'owner-email',$2,now()+interval '1 hour')`,[hash(token),a.email]);
  await client.query('COMMIT');
  return Response.json({ok:true,mustChangePassword:a.must_change_password},{headers:{'Set-Cookie':cookie('pair_owner_session',token,3600),'Cache-Control':'no-store'}});
 }catch(error){try{await client.query('ROLLBACK')}catch{}throw error}finally{client.release()}
}
export async function emailSession(request:Request){
 const token=readCookie(request,'pair_owner_session');
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new OwnerError('owner_session_invalid',401);
 const r=await database().query<{email:string;must_change_password:boolean}>(`SELECT e.email,e.must_change_password FROM owner_sessions s JOIN owner_email_accounts e ON e.email=s.provider_user_id WHERE s.token_hash=$1 AND s.provider_channel_id='owner-email' AND s.expires_at>now()`,[hash(token)]);
 const account=r.rows[0];if(!account)throw new OwnerError('owner_session_invalid',401);
 return {email:account.email,mustChangePassword:account.must_change_password,sessionHash:hash(token)};
}
export async function ownerEmailChangePassword(request:Request){
 if(Number(request.headers.get('content-length')||0)>2048)throw new OwnerError('request_too_large',413);
 const session=await emailSession(request);
 await csrf(request,session.sessionHash);
 const body=await request.json().catch(()=>({}));
 if(typeof body.currentPassword!=='string'||!passPolicy(body.newPassword)||body.currentPassword===body.newPassword)throw new OwnerError('password_policy',400);
 const client=await database().connect();
 try{
  await client.query('BEGIN');
  const a=(await client.query<Account>('SELECT * FROM owner_email_accounts WHERE email=$1 FOR UPDATE',[session.email])).rows[0];
  if(!a||!equals(await derivePassword(body.currentPassword,a.password_salt),a.password_hash))throw new OwnerError('identity_invalid',401);
  const salt=randomBytes(16).toString('hex'),passwordHash=await derivePassword(body.newPassword,salt);
  await client.query('UPDATE owner_email_accounts SET password_salt=$2,password_hash=$3,must_change_password=false,failed_attempts=0,locked_until=NULL,updated_at=now() WHERE email=$1',[session.email,salt,passwordHash]);
  await client.query('DELETE FROM owner_sessions WHERE provider_channel_id=$1 AND provider_user_id=$2 AND token_hash<>$3',['owner-email',session.email,session.sessionHash]);
  await client.query('COMMIT');
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch(error){try{await client.query('ROLLBACK')}catch{}throw error}finally{client.release()}
}
