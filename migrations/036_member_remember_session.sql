-- Existing 12-hour sessions retain their original expiry and remain valid.
ALTER TABLE member_sessions ADD COLUMN IF NOT EXISTS remember_session boolean NOT NULL DEFAULT false;
ALTER TABLE member_sessions ADD COLUMN IF NOT EXISTS rotated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE member_sessions ADD COLUMN IF NOT EXISTS previous_token_hash text;
ALTER TABLE member_sessions ADD COLUMN IF NOT EXISTS previous_valid_until timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS member_sessions_previous_hash_idx ON member_sessions(previous_token_hash) WHERE previous_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS member_sessions_expiry_idx ON member_sessions(expires_at);
CREATE INDEX IF NOT EXISTS member_identities_recent_member_idx ON member_identities(member_id,last_login_at DESC);
