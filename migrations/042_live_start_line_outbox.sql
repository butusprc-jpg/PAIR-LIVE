-- One server-confirmed VDO.Ninja display transition per OA revision.
CREATE TABLE live_start_line_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 oa_id uuid NOT NULL REFERENCES oa_service_control(id),
 live_revision bigint NOT NULL,
 shop_name text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(oa_id,live_revision)
);
CREATE TABLE live_start_line_outbox (
 event_id uuid NOT NULL REFERENCES live_start_line_events(id),
 member_id uuid NOT NULL REFERENCES members(id),
 oa_id uuid NOT NULL REFERENCES oa_service_control(id),
 recipient_user_id text NOT NULL CHECK (recipient_user_id ~ '^U[0-9a-fA-F]{32}$'),
 retry_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENDING','SENT','FAILED')),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
 lease_until timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 last_error text,
 sent_at timestamptz,
 PRIMARY KEY(event_id,member_id),
 CHECK ((status='SENDING')=(lease_until IS NOT NULL))
);
CREATE INDEX live_start_line_due ON live_start_line_outbox(next_attempt_at,event_id,member_id) WHERE status IN ('PENDING','SENDING','FAILED');
REVOKE ALL ON live_start_line_events,live_start_line_outbox FROM PUBLIC;
