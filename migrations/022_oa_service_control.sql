-- Owner control plane. No seed records or changes to financial data.
CREATE TABLE owner_sessions (
 token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
 provider_channel_id text NOT NULL,
 provider_user_id text NOT NULL,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE owner_csrf_challenges (
 token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
 session_hash text,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE oa_service_control (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 line_oa_id text NOT NULL UNIQUE CHECK (length(line_oa_id) BETWEEN 2 AND 80),
 shop_name text NOT NULL CHECK (length(shop_name) BETWEEN 1 AND 160),
 enabled boolean NOT NULL DEFAULT false,
 verified_token_hash text CHECK (verified_token_hash ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE oa_service_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 oa_id uuid NOT NULL REFERENCES oa_service_control(id),
 actor_channel_id text NOT NULL,
 actor_user_id text NOT NULL,
 action text NOT NULL CHECK (action IN ('ADD','ENABLE','DISABLE','SET_EXPIRY','EXTEND_30_DAYS')),
 before_state jsonb,
 after_state jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 request_key uuid NOT NULL UNIQUE
);
REVOKE ALL ON owner_sessions,owner_csrf_challenges,oa_service_control,oa_service_audit FROM PUBLIC;
