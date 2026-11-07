-- V11: countdown is independent of the configured round duration.
ALTER TABLE round_settings ADD COLUMN countdown_seconds integer NOT NULL DEFAULT 120 CHECK (countdown_seconds BETWEEN 30 AND 3600);
ALTER TABLE rounds
 ADD COLUMN countdown_started_at timestamptz,
 ADD COLUMN countdown_ends_at timestamptz,
 ADD COLUMN countdown_stopped_at timestamptz,
 ADD CONSTRAINT rounds_countdown_window CHECK ((countdown_started_at IS NULL)=(countdown_ends_at IS NULL) AND (countdown_stopped_at IS NULL OR countdown_started_at IS NOT NULL));
CREATE TABLE member_countdown_line_preferences (
 member_id uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE member_countdown_line_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_countdown_line_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY countdown_preference_own ON member_countdown_line_preferences
 USING (member_id=NULLIF(current_setting('pair_live.member_id',true),'')::uuid)
 WITH CHECK (member_id=NULLIF(current_setting('pair_live.member_id',true),'')::uuid);
CREATE POLICY countdown_preference_dispatch ON member_countdown_line_preferences FOR SELECT
 USING (current_setting('pair_live.countdown_dispatch',true)='true');
CREATE TABLE round_countdown_line_outbox (
 round_id bigint NOT NULL REFERENCES rounds(id),
 member_id uuid NOT NULL REFERENCES members(id),
 oa_id uuid NOT NULL REFERENCES oa_service_control(id),
 recipient_user_id text NOT NULL CHECK (recipient_user_id ~ '^U[0-9a-fA-F]{32}$'),
 retry_key uuid NOT NULL DEFAULT gen_random_uuid(),
 status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENDING','SENT','FAILED')),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
 lease_until timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 last_error text,
 last_http_status integer,
 sent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(round_id,member_id),
 UNIQUE(retry_key),
 CHECK ((status='SENDING')=(lease_until IS NOT NULL)),
 CHECK (status<>'SENT' OR sent_at IS NOT NULL)
);
CREATE INDEX round_countdown_line_outbox_due ON round_countdown_line_outbox(next_attempt_at,round_id,member_id)
 WHERE status IN ('PENDING','SENDING','FAILED');
REVOKE ALL ON member_countdown_line_preferences,round_countdown_line_outbox FROM PUBLIC;
