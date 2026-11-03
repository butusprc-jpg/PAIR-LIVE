-- Apply explicitly to the PAIR LIVE PostgreSQL database using a migration role.
-- This migration never reads or alters member, camera or round-engine tables.
BEGIN;

CREATE TABLE IF NOT EXISTS admin_identities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 provider text NOT NULL CHECK (provider='line'),
 provider_channel_id text NOT NULL CHECK (length(provider_channel_id)>0),
 provider_user_id text NOT NULL CHECK (length(provider_user_id)>0),
 display_name text NOT NULL,
 avatar_url text,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (provider,provider_channel_id,provider_user_id)
);
-- Membership and role authorization come only from the server allowlist. This
-- table stores profiles for explicitly allowed identities; it grants no role.
CREATE INDEX IF NOT EXISTS admin_identities_status_idx ON admin_identities(status);

CREATE TABLE IF NOT EXISTS admin_sessions (
 token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
 admin_id uuid NOT NULL REFERENCES admin_identities(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (expires_at>created_at)
);
CREATE INDEX IF NOT EXISTS admin_sessions_admin_idx ON admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 admin_id uuid REFERENCES admin_identities(id) ON DELETE SET NULL,
 action text NOT NULL CHECK (action IN ('login','logout','revoke')),
 details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details)='object'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_logs_admin_time_idx ON admin_audit_logs(admin_id,created_at DESC);

CREATE TABLE IF NOT EXISTS admin_auth_challenges (
 token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
 session_hash text CHECK (session_hash ~ '^[0-9a-f]{64}$'),
 purpose text NOT NULL CHECK (purpose IN ('login','logout','mutation')),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_auth_challenges_expiry_idx ON admin_auth_challenges(expires_at);

REVOKE ALL ON admin_identities,admin_sessions,admin_audit_logs,admin_auth_challenges FROM PUBLIC;
COMMIT;

-- Grant the private runtime role only these table permissions:
-- admin_identities: SELECT, INSERT, UPDATE (column-limited if operationally possible)
-- admin_sessions: SELECT, INSERT, UPDATE
-- admin_audit_logs: INSERT
-- admin_auth_challenges: INSERT, DELETE, SELECT
-- The runtime role must never be exposed through a public browser database SDK.
-- Operators should periodically delete expired challenges and expired/revoked
-- sessions with a private maintenance role, according to retention policy.
