CREATE TABLE IF NOT EXISTS members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 display_name text NOT NULL,
 avatar_url text,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
 demo_points integer NOT NULL DEFAULT 0 CHECK (demo_points >= 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS member_identities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 provider text NOT NULL CHECK (provider IN ('line','wechat')),
 provider_user_id text NOT NULL,
 provider_channel_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 last_login_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (provider,provider_channel_id,provider_user_id)
);
CREATE INDEX IF NOT EXISTS member_identities_member_id_idx ON member_identities(member_id);
CREATE TABLE IF NOT EXISTS member_sessions (
 token_hash text PRIMARY KEY,
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS member_sessions_member_id_idx ON member_sessions(member_id);
CREATE TABLE IF NOT EXISTS member_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 round_id text NOT NULL,
 side text NOT NULL CHECK (side IN ('even','odd')),
 demo_points integer NOT NULL CHECK (demo_points > 0),
 result text NOT NULL DEFAULT 'pending' CHECK (result IN ('pending','correct','incorrect')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS member_history_owner_time_idx ON member_history(member_id,created_at DESC);
REVOKE ALL ON members,member_identities,member_sessions,member_history FROM PUBLIC;
-- Application routes use a private database role and scope queries to the authenticated session member_id.
-- Never expose this role or DATABASE_URL to browser code.
ALTER TABLE member_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_history FORCE ROW LEVEL SECURITY;
CREATE POLICY member_history_own_rows ON member_history
 USING (member_id = NULLIF(current_setting('pair_live.member_id', true), '')::uuid)
 WITH CHECK (member_id = NULLIF(current_setting('pair_live.member_id', true), '')::uuid);
