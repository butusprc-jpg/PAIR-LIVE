-- One LINE OA broadcast attempt stream per round. Retry key is stable across retries.
CREATE TABLE round_line_broadcast_outbox (
 round_id bigint PRIMARY KEY REFERENCES rounds(id),
 retry_key uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENDING','SENT','FAILED','UNKNOWN')),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 lease_until timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 accepted_request_id text,
 last_http_status integer,
 error_code text,
 sent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((status='SENT')=(sent_at IS NOT NULL))
);
CREATE INDEX round_line_broadcast_pending_idx ON round_line_broadcast_outbox(next_attempt_at,round_id)
 WHERE status IN ('PENDING','SENDING','FAILED','UNKNOWN');
REVOKE ALL ON round_line_broadcast_outbox FROM PUBLIC;
