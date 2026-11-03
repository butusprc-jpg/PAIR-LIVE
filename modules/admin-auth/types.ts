export type AdminRole = 'admin' | 'operator' | 'viewer';
export type AdminErrorCode = 'admin_not_configured' | 'identity_invalid' | 'admin_forbidden' | 'session_invalid' | 'csrf_invalid' | 'request_invalid' | 'method_not_allowed' | 'service_unavailable';
export type Result<T> = {ok:true;value:T} | {ok:false;error:AdminErrorCode};
export interface LineIdentity {provider:'line';providerChannelId:string;providerUserId:string;displayName:string;avatarUrl:string|null}
export interface LineIdentityProvider {verify(token:string, channelId:string):Promise<LineIdentity>}
export interface AdminAllowlistEntry {userId:string;role:AdminRole}
export interface AdminIdentity extends LineIdentity {id:string;status:'active'|'disabled'}
export interface VerifiedAdminIdentity {readonly identity:AdminIdentity;readonly role:AdminRole}
export interface AdminProfile {id:string;displayName:string;avatarUrl:string|null;role:AdminRole}
export interface AdminSession {tokenHash:string;adminId:string;createdAt:number;expiresAt:number;revokedAt:number|null}
export interface AuthenticatedAdminSession {session:AdminSession;admin:AdminProfile}
export type ChallengePurpose = 'login'|'logout'|'mutation';
export interface AdminChallenge {tokenHash:string;sessionHash:string|null;purpose:ChallengePurpose;expiresAt:number}
export interface AdminAuditEvent {adminId:string;action:'login'|'logout'|'revoke';createdAt:number;details:Record<string,string>}
export interface AdminDatabase {
 /** Called only AFTER server-side verification and explicit allowlist authorization. Never enable a disabled identity. */
 upsertAllowedIdentity(identity:LineIdentity, now:number):Promise<AdminIdentity>;
 findIdentity(id:string):Promise<AdminIdentity|null>;
 audit(event:AdminAuditEvent):Promise<void>;
}
export interface AdminSessionStore {
 insert(session:AdminSession):Promise<void>;
 find(tokenHash:string):Promise<AdminSession|null>;
 revoke(tokenHash:string, now:number):Promise<void>;
 putChallenge(challenge:AdminChallenge):Promise<void>;
 /** Atomically consume only when all fields match and expiresAt > now. */
 consumeChallenge(tokenHash:string, sessionHash:string|null, purpose:ChallengePurpose, now:number):Promise<boolean>;
}
export interface AdminAuthConfig {
 channelId:string;
 origin:string;
 allowlist:readonly AdminAllowlistEntry[];
 identityProvider:LineIdentityProvider;
 database:AdminDatabase;
 sessionStore:AdminSessionStore;
 /** Explicit development permits HTTP only for loopback origins. Production always uses Secure cookies. */
 environment:'production'|'development';
 sessionTtlSeconds?:number;
 challengeTtlSeconds?:number;
 now?:()=>number;
}
export interface CreatedAdminSession {token:string;session:AdminSession;admin:AdminProfile}
export interface AdminAuth {
 verifyAdminIdentity(token:string):Promise<Result<VerifiedAdminIdentity>>;
 createAdminSession(identity:VerifiedAdminIdentity, previousToken?:string):Promise<Result<CreatedAdminSession>>;
 getAdminSession(request:Request):Promise<Result<AuthenticatedAdminSession>>;
 requireAdmin(request:Request, roles?:readonly AdminRole[]):Promise<Result<AuthenticatedAdminSession>>;
 revokeAdminSession(session:AuthenticatedAdminSession):Promise<Result<void>>;
 /** Consume a one-use mutation challenge before a protected non-auth write. */
 requireAdminMutation(request:Request, roles?:readonly AdminRole[]):Promise<Result<AuthenticatedAdminSession>>;
 handleAdminChallenge(request:Request):Promise<Response>;
 handleAdminLogin(request:Request):Promise<Response>;
 handleAdminLogout(request:Request):Promise<Response>;
 handleAdminSessionCheck(request:Request):Promise<Response>;
}
