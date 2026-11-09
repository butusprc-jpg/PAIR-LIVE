-- Staging groundwork. No credentials are seeded and no existing OA is activated.
CREATE TABLE oa_credentials (
 oa_id uuid PRIMARY KEY REFERENCES oa_service_control(id) ON DELETE RESTRICT,
 webhook_key text NOT NULL UNIQUE CHECK (webhook_key ~ '^[A-Za-z0-9_-]{32,128}$'),
 login_channel_id text NOT NULL UNIQUE CHECK (length(login_channel_id) BETWEEN 1 AND 255),
 messaging_channel_id text NOT NULL UNIQUE CHECK (length(messaging_channel_id) BETWEEN 1 AND 255),
 liff_id text NOT NULL UNIQUE CHECK (length(liff_id) BETWEEN 1 AND 255),
 login_secret_ciphertext text NOT NULL,
 messaging_secret_ciphertext text NOT NULL,
 access_token_ciphertext text NOT NULL,
 key_version integer NOT NULL DEFAULT 1 CHECK (key_version > 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text NOT NULL
);
CREATE TABLE oa_credential_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 oa_id uuid NOT NULL REFERENCES oa_service_control(id),
 key_version integer NOT NULL,
 actor text NOT NULL,
 action text NOT NULL CHECK (action IN ('CREATE','ROTATE')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (oa_id,key_version)
);
REVOKE ALL ON oa_credentials,oa_credential_audit FROM PUBLIC;
