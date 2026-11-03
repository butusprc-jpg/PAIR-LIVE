-- Apply to the PAIR LIVE PostgreSQL database after the member and round migrations.
-- No member, round, camera or OCR schema is modified.
BEGIN;

CREATE TABLE report_notification_settings (
 id integer PRIMARY KEY DEFAULT 1 CHECK (id=1),
 enabled boolean NOT NULL DEFAULT false,
 email_frequency text NOT NULL DEFAULT 'both' CHECK (email_frequency IN ('round','daily','both')),
 daily_time_bangkok time NOT NULL DEFAULT '09:00',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text NOT NULL DEFAULT 'migration'
);
INSERT INTO report_notification_settings(id) VALUES (1);

CREATE TABLE report_notification_recipients (
 id text PRIMARY KEY,
 channel text NOT NULL CHECK (channel IN ('line','email','wechat')),
 address text NOT NULL CHECK (length(address)>0),
 enabled boolean NOT NULL DEFAULT false,
 events text[] NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text NOT NULL DEFAULT 'migration',
 UNIQUE(channel,address)
);
CREATE INDEX report_notification_recipients_channel_enabled_idx ON report_notification_recipients(channel,enabled);

CREATE TABLE report_notification_events (
 event_id text PRIMARY KEY,
 event_type text NOT NULL CHECK (event_type IN ('ROUND_CLOSED','ROUND_SETTLED','OCR_REVIEW_REQUIRED','CAMERA_OFFLINE','STREAM_OFFLINE','WORKER_ERROR','DAILY_SUMMARY')),
 occurred_at timestamptz NOT NULL,
 round_id text,
 report_date date,
 source text NOT NULL CHECK (source='core'),
 payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE report_notification_outbox (
 id text PRIMARY KEY,
 event_id text NOT NULL REFERENCES report_notification_events(event_id),
 idempotency_key text NOT NULL UNIQUE,
 channel text NOT NULL CHECK (channel IN ('line','email','wechat')),
 recipient_id text NOT NULL,
 address text NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','SENT','RETRY','FAILED','NOT_CONFIGURED','NOT_SUPPORTED')),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz,
 -- SENT means provider accepted the request. Recipient opening/reading is unknown.
 provider_accepted_at timestamptz,
 lease_owner text,
 lease_until timestamptz,
 last_error_code text,
 UNIQUE(event_id,channel,recipient_id),
 CHECK ((status='PROCESSING')=(lease_owner IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX report_notification_due_idx ON report_notification_outbox(next_attempt_at,created_at)
 WHERE status IN ('PENDING','RETRY');
CREATE INDEX report_notification_lease_idx ON report_notification_outbox(lease_until)
 WHERE status='PROCESSING';
CREATE INDEX report_notification_event_idx ON report_notification_outbox(event_id);
CREATE INDEX report_notification_sent_idx ON report_notification_outbox(sent_at) WHERE status='SENT';

CREATE TABLE report_notification_delivery_logs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 delivery_id text NOT NULL REFERENCES report_notification_outbox(id),
 event_id text NOT NULL REFERENCES report_notification_events(event_id),
 channel text NOT NULL,
 status text NOT NULL,
 attempt integer NOT NULL,
 error_code text,
 provider_accepted boolean NOT NULL DEFAULT false,
 -- There is deliberately no opened/read state without provider evidence.
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_notification_logs_delivery_time_idx ON report_notification_delivery_logs(delivery_id,created_at DESC);

REVOKE ALL ON report_notification_settings,report_notification_recipients,report_notification_events,
 report_notification_outbox,report_notification_delivery_logs FROM PUBLIC;
REVOKE ALL ON SEQUENCE report_notification_delivery_logs_id_seq FROM PUBLIC;
COMMIT;

-- Grant a private runtime role SELECT on rounds and authorized aggregate access
-- to round_entries. The existing round_entries FORCE RLS owner policy means an
-- ordinary role sees no cross-member rows; provision a narrowly controlled
-- report reader role with BYPASSRLS, or add an audited aggregate read policy in
-- a separate Core migration after review. Never use a browser/member DB role.
-- Grant SELECT/INSERT/UPDATE/DELETE on these report tables only as needed to
-- private worker and admin roles. Never store provider tokens in these tables.
