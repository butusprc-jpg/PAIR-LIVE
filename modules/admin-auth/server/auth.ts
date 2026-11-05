import type {AdminAuth,AdminAuthConfig,AdminErrorCode,AdminRole,AuthenticatedAdminSession,ChallengePurpose,CreatedAdminSession,Result,VerifiedAdminIdentity} from '../types';
import {assertServerRuntime,cookie,hashToken,randomToken,validToken} from './runtime';
import {allowlistMap,roleFor,validIdentity} from './identity';
import {ADMIN_COOKIE,CSRF_COOKIE,profile,sessionCookie} from './session';
import {consumeCsrf,sameOrigin} from './csrf';
import {roleAllowed} from './guard';
export class AdminAuthConfigurationError extends Error {readonly code='admin_not_configured' as const;constructor(){super('admin_not_configured');assertServerRuntime();this.name='AdminAuthConfigurationError'}}
const fail=<T>(error:AdminErrorCode):Result<T>=>({ok:false,error});
const ok=<T>(value:T):Result<T>=>({ok:true,value});
const status:Record<AdminErrorCode,number>={admin_not_configured:503,identity_invalid:401,admin_forbidden:403,session_invalid:401,csrf_invalid:403,request_invalid:400,method_not_allowed:405,service_unavailable:503};
function json(body:unknown,code=200,cookies:string[]=[]):Response {
 const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Cookie, Origin','X-Content-Type-Options':'nosniff'});
 for(const value of cookies)headers.append('Set-Cookie',value);
 return new Response(JSON.stringify(body),{status:code,headers});
}
function errorResponse(error:AdminErrorCode):Response{return json({ok:false,error},status[error])}
async function body(request:Request):Promise<Record<string,unknown>|null> {
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return null;
 // Cap actual streamed bytes, rather than trusting Content-Length.
 if(!request.body)return null;const reader=request.body.getReader();let size=0;const chunks:Uint8Array[]=[];
 try {for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>16384){await reader.cancel();return null}chunks.push(part.value)}
 const value=JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
 return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
 }catch{return null}finally{reader.releaseLock()}
}
/** All dependencies are server-side. No demo provider or member-session fallback exists. */
export function createAdminAuth(config:AdminAuthConfig):AdminAuth {
 assertServerRuntime();let allowlist:ReadonlyMap<string,AdminRole>;
 try {
  if(!config||!config.channelId?.trim()||config.channelId!==config.channelId.trim()||!Array.isArray(config.allowlist)||(config.allowlist.length===0&&!config.database?.findVerifiedIdentity)||!config.identityProvider?.verify||!config.database?.upsertAllowedIdentity||!config.database?.findIdentity||!config.database?.audit||!config.sessionStore?.insert||!config.sessionStore?.find||!config.sessionStore?.revoke||!config.sessionStore?.putChallenge||!config.sessionStore?.consumeChallenge)throw new Error();
  const url=new URL(config.origin);
  if(url.origin!==config.origin||url.username||url.password||!['production','development'].includes(config.environment)||(config.environment==='production'&&url.protocol!=='https:')||(config.environment==='development'&&url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw new Error();
  allowlist=allowlistMap(config.allowlist);
 }catch{throw new AdminAuthConfigurationError()}
 const ttl=config.sessionTtlSeconds??3600;const challengeTtl=config.challengeTtlSeconds??120;
 if(!Number.isInteger(ttl)||ttl<60||ttl>43200||!Number.isInteger(challengeTtl)||challengeTtl<10||challengeTtl>300)throw new AdminAuthConfigurationError();
 const channelId=config.channelId,origin=config.origin,provider=config.identityProvider,database=config.database,store=config.sessionStore,secure=config.environment==='production'||process.env.NODE_ENV==='production'||origin.startsWith('https:');
 const now=config.now??Date.now;const verified=new WeakSet<VerifiedAdminIdentity>();
 async function verifyAdminIdentity(token:string):Promise<Result<VerifiedAdminIdentity>> {
  assertServerRuntime();if(typeof token!=='string'||!token||token.length>8192)return fail('identity_invalid');
  let identity;try{identity=await provider.verify(token,channelId)}catch{return fail('identity_invalid')}
  if(!validIdentity(identity,channelId))return fail('identity_invalid');
  const bootstrapRole=roleFor(identity,channelId,allowlist);
  try {
   const existing=database.findVerifiedIdentity?await database.findVerifiedIdentity(identity):null;
   const role=existing?.role??bootstrapRole;if(!role)return fail('admin_forbidden');
   const admin=existing?.role||!bootstrapRole?existing:await database.upsertAllowedIdentity(identity,now(),bootstrapRole);
   if(!admin)return fail('admin_forbidden');
   if(!validIdentity(admin,channelId)||admin.providerUserId!==identity.providerUserId||!admin.id||admin.status!=='active')return fail('admin_forbidden');
   const result=Object.freeze({identity:Object.freeze({...admin}),role});verified.add(result);return ok(result);
  }catch{return fail('service_unavailable')}
 }
 async function createAdminSession(identity:VerifiedAdminIdentity,previousToken?:string):Promise<Result<CreatedAdminSession>> {
  assertServerRuntime();if(!identity||!verified.has(identity))return fail('identity_invalid');verified.delete(identity);
  let insertedHash:string|undefined;
  try {
   const admin=await database.findIdentity(identity.identity.id);const role=admin?(admin.role??roleFor(admin,channelId,allowlist)):null;
   if(!admin||!validIdentity(admin,channelId)||admin.status!=='active'||!role||admin.providerUserId!==identity.identity.providerUserId)return fail('admin_forbidden');
   const time=now();const token=randomToken();const session={tokenHash:hashToken(token),adminId:admin.id,createdAt:time,expiresAt:time+ttl*1000,revokedAt:null};
   if(previousToken&&validToken(previousToken))await store.revoke(hashToken(previousToken),time);
   await store.insert(session);insertedHash=session.tokenHash;
   await database.audit({adminId:admin.id,action:'login',createdAt:time,details:{}});
   return ok({token,session,admin:profile(admin,role)});
  }catch{if(insertedHash)try{await store.revoke(insertedHash,now())}catch{/* fail closed: no cookie returned */}return fail('service_unavailable')}
 }
 async function getAdminSession(request:Request):Promise<Result<AuthenticatedAdminSession>> {
  assertServerRuntime();const token=cookie(request,ADMIN_COOKIE);if(!token)return fail('session_invalid');
  try {
   const session=await store.find(hashToken(token));const time=now();
   if(!session||session.tokenHash!==hashToken(token)||session.revokedAt!==null||!Number.isFinite(session.expiresAt)||session.expiresAt<=time)return fail('session_invalid');
   const admin=await database.findIdentity(session.adminId);const role=admin?(admin.role??roleFor(admin,channelId,allowlist)):null;
   if(!admin||!validIdentity(admin,channelId)||admin.status!=='active'||!role)return fail('admin_forbidden');
   return ok({session,admin:profile(admin,role)});
  }catch{return fail('service_unavailable')}
 }
 async function requireAdmin(request:Request,roles:readonly AdminRole[]=['admin']):Promise<Result<AuthenticatedAdminSession>> {
  assertServerRuntime();const result=await getAdminSession(request);if(!result.ok)return result;
  return roleAllowed(result.value.admin.role,roles)?result:fail('admin_forbidden');
 }
 async function revokeAdminSession(authenticated:AuthenticatedAdminSession):Promise<Result<void>> {
  assertServerRuntime();try{
   const session=await store.find(authenticated.session.tokenHash);
   if(!session||session.adminId!==authenticated.admin.id)return fail('session_invalid');
   const time=now();await store.revoke(session.tokenHash,time);await database.audit({adminId:session.adminId,action:'revoke',createdAt:time,details:{}});return ok(undefined);
  }catch{return fail('service_unavailable')}
 }
 async function requireAdminMutation(request:Request,roles:readonly AdminRole[]=['admin']):Promise<Result<AuthenticatedAdminSession>> {
  assertServerRuntime();if(!['POST','PUT','PATCH','DELETE'].includes(request.method))return fail('method_not_allowed');
  const result=await requireAdmin(request,roles);if(!result.ok)return result;
  try{return await consumeCsrf(request,origin,store,'mutation',now())?result:fail('csrf_invalid')}catch{return fail('service_unavailable')}
 }
 async function handleAdminChallenge(request:Request):Promise<Response> {
  assertServerRuntime();if(request.method!=='POST')return errorResponse('method_not_allowed');if(!sameOrigin(request,origin))return errorResponse('csrf_invalid');
  const data=await body(request);const purpose=data?.purpose as ChallengePurpose;
  if(!['login','logout','mutation'].includes(purpose))return errorResponse('request_invalid');
  if(purpose==='mutation'){const session=await getAdminSession(request);if(!session.ok)return errorResponse(session.error)}
  if(purpose==='logout'){
   const token=cookie(request,ADMIN_COOKIE);if(!token)return errorResponse('session_invalid');
   try{const stored=await store.find(hashToken(token));if(!stored||stored.revokedAt!==null||stored.expiresAt<=now())return errorResponse('session_invalid')}catch{return errorResponse('service_unavailable')}
  }
  try {
   const token=randomToken(),session=cookie(request,ADMIN_COOKIE);
   await store.putChallenge({tokenHash:hashToken(token),sessionHash:session?hashToken(session):null,purpose,expiresAt:now()+challengeTtl*1000});
   return json({ok:true,csrfToken:token},200,[sessionCookie(CSRF_COOKIE,token,challengeTtl,secure)]);
  }catch{return errorResponse('service_unavailable')}
 }
 async function handleAdminLogin(request:Request):Promise<Response> {
  assertServerRuntime();if(request.method!=='POST')return errorResponse('method_not_allowed');
  try{if(!await consumeCsrf(request,origin,store,'login',now()))return errorResponse('csrf_invalid')}catch{return errorResponse('service_unavailable')}
  const data=await body(request);if(typeof data?.accessToken!=='string')return errorResponse('request_invalid');
  const identity=await verifyAdminIdentity(data.accessToken);if(!identity.ok)return errorResponse(identity.error);
  const result=await createAdminSession(identity.value,cookie(request,ADMIN_COOKIE)||undefined);if(!result.ok)return errorResponse(result.error);
  return json({ok:true,session:{admin:result.value.admin,expiresAt:result.value.session.expiresAt}},200,[sessionCookie(ADMIN_COOKIE,result.value.token,ttl,secure),sessionCookie(CSRF_COOKIE,'',0,secure)]);
 }
 async function handleAdminLogout(request:Request):Promise<Response> {
  assertServerRuntime();if(request.method!=='POST')return errorResponse('method_not_allowed');
  try{if(!await consumeCsrf(request,origin,store,'logout',now()))return errorResponse('csrf_invalid')}catch{return errorResponse('service_unavailable')}
  // Revocation must still work when an administrator was disabled after login.
  const token=cookie(request,ADMIN_COOKIE);
  if(!token)return errorResponse('session_invalid');
  try{
   const stored=await store.find(hashToken(token));if(!stored)return errorResponse('session_invalid');
   await store.revoke(stored.tokenHash,now());await database.audit({adminId:stored.adminId,action:'logout',createdAt:now(),details:{}});
   return json({ok:true},200,[sessionCookie(ADMIN_COOKIE,'',0,secure),sessionCookie(CSRF_COOKIE,'',0,secure)]);
  }catch{return errorResponse('service_unavailable')}
 }
 async function handleAdminSessionCheck(request:Request):Promise<Response> {
  assertServerRuntime();if(request.method!=='GET')return errorResponse('method_not_allowed');const result=await getAdminSession(request);
  return result.ok?json({ok:true,session:{admin:result.value.admin,expiresAt:result.value.session.expiresAt}}):errorResponse(result.error);
 }
 return {verifyAdminIdentity,createAdminSession,getAdminSession,requireAdmin,revokeAdminSession,requireAdminMutation,handleAdminChallenge,handleAdminLogin,handleAdminLogout,handleAdminSessionCheck};
}
