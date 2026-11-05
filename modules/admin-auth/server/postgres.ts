import type {Pool} from 'pg';
import type {AdminDatabase, AdminIdentity, AdminSession, AdminSessionStore, AdminRole} from '../types';
import {assertServerRuntime} from './runtime';

type IdentityRow = {
 id:string;provider:'line';provider_channel_id:string;provider_user_id:string;
 display_name:string;avatar_url:string|null;status:'active'|'disabled';role:AdminRole|null;
};
type SessionRow = {
 token_hash:string;admin_id:string;created_at:Date;expires_at:Date;revoked_at:Date|null;
};
function identity(row:IdentityRow):AdminIdentity {
 return {id:row.id,provider:row.provider,providerChannelId:row.provider_channel_id,
  providerUserId:row.provider_user_id,displayName:row.display_name,avatarUrl:row.avatar_url,status:row.status,role:row.role};
}
function session(row:SessionRow):AdminSession {
 return {tokenHash:row.token_hash,adminId:row.admin_id,createdAt:row.created_at.getTime(),
  expiresAt:row.expires_at.getTime(),revokedAt:row.revoked_at?.getTime()??null};
}

/** Inject a private PAIR LIVE pool; this adapter never reads environment variables or runs migrations. */
export function createPostgresAdminAdapters(pool:Pick<Pool,'query'>):{database:AdminDatabase;sessionStore:AdminSessionStore} {
 assertServerRuntime();
 if(!pool||typeof pool.query!=='function')throw new Error('admin_database_not_configured');
 const database:AdminDatabase = {
  async upsertAllowedIdentity(verified,now,bootstrapRole) {
   assertServerRuntime();
   // Authorization happens in createAdminAuth before this method. Conflict handling
   // deliberately preserves status so login cannot reactivate a disabled admin.
   const result=await pool.query<IdentityRow>(
    `INSERT INTO admin_identities (provider,provider_channel_id,provider_user_id,display_name,avatar_url,created_at,updated_at,role)
     VALUES ($1,$2,$3,$4,$5,$6,$6,$7)
     ON CONFLICT (provider,provider_channel_id,provider_user_id) DO UPDATE
     SET display_name=EXCLUDED.display_name,avatar_url=EXCLUDED.avatar_url,updated_at=EXCLUDED.updated_at,role=COALESCE(admin_identities.role,EXCLUDED.role)
     RETURNING id,provider,provider_channel_id,provider_user_id,display_name,avatar_url,status,role`,
    [verified.provider,verified.providerChannelId,verified.providerUserId,verified.displayName,verified.avatarUrl,new Date(now),bootstrapRole]);
   return identity(result.rows[0]);
  },
  async findVerifiedIdentity(verified) {
   assertServerRuntime();
   const result=await pool.query<IdentityRow>('SELECT id,provider,provider_channel_id,provider_user_id,display_name,avatar_url,status,role FROM admin_identities WHERE provider=$1 AND provider_channel_id=$2 AND provider_user_id=$3',[verified.provider,verified.providerChannelId,verified.providerUserId]);
   return result.rows[0]?identity(result.rows[0]):null;
  },
  async findIdentity(id) {
   assertServerRuntime();
   const result=await pool.query<IdentityRow>(
    'SELECT id,provider,provider_channel_id,provider_user_id,display_name,avatar_url,status,role FROM admin_identities WHERE id=$1',[id]);
   return result.rows[0]?identity(result.rows[0]):null;
  },
  async audit(event) {
   assertServerRuntime();
   // Do not serialize caller-supplied details: audit storage only retains the
   // module's enumerated action. Tokens, headers and provider payloads stay out.
   await pool.query('INSERT INTO admin_audit_logs (admin_id,action,details,created_at) VALUES ($1,$2,$3::jsonb,$4)',
    [event.adminId,event.action,'{}',new Date(event.createdAt)]);
  },
 };
 const sessionStore:AdminSessionStore = {
  async insert(value) {
   assertServerRuntime();
   await pool.query('INSERT INTO admin_sessions (token_hash,admin_id,created_at,expires_at,revoked_at) VALUES ($1,$2,$3,$4,$5)',
    [value.tokenHash,value.adminId,new Date(value.createdAt),new Date(value.expiresAt),value.revokedAt===null?null:new Date(value.revokedAt)]);
  },
  async find(tokenHash) {
   assertServerRuntime();
   const result=await pool.query<SessionRow>('SELECT token_hash,admin_id,created_at,expires_at,revoked_at FROM admin_sessions WHERE token_hash=$1',[tokenHash]);
   return result.rows[0]?session(result.rows[0]):null;
  },
  async revoke(tokenHash,now) {
   assertServerRuntime();
   await pool.query('UPDATE admin_sessions SET revoked_at=COALESCE(revoked_at,$2) WHERE token_hash=$1',[tokenHash,new Date(now)]);
  },
  async putChallenge(value) {
   assertServerRuntime();
   await pool.query('INSERT INTO admin_auth_challenges (token_hash,session_hash,purpose,expires_at) VALUES ($1,$2,$3,$4)',
    [value.tokenHash,value.sessionHash,value.purpose,new Date(value.expiresAt)]);
  },
  async consumeChallenge(tokenHash,sessionHash,purpose,now) {
   assertServerRuntime();
   // A single DELETE statement is atomic across processes and concurrent requests.
   // Null-safe comparison binds pre-login challenges to the anonymous context.
   const result=await pool.query(
    `DELETE FROM admin_auth_challenges WHERE token_hash=$1 AND session_hash IS NOT DISTINCT FROM $2::text
     AND purpose=$3 AND expires_at>$4 RETURNING token_hash`,[tokenHash,sessionHash,purpose,new Date(now)]);
   return result.rowCount===1;
  },
 };
 return {database,sessionStore};
}
