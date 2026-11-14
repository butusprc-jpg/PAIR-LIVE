-- One committed result notification per settled entry. No LINE delivery in the settlement transaction.
CREATE TABLE round_result_line_outbox (
 entry_id uuid PRIMARY KEY REFERENCES round_entries(id) ON DELETE RESTRICT,
 round_id bigint NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT,
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
 oa_id uuid NOT NULL REFERENCES oa_service_control(id) ON DELETE RESTRICT,
 recipient_user_id text CHECK (recipient_user_id ~ '^U[0-9a-fA-F]{32}$'),
 retry_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENDING','SENT','FAILED','UNDELIVERABLE')),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
 lease_until timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 last_error text,
 sent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((status='SENDING')=(lease_until IS NOT NULL)),
 CHECK (status<>'SENT' OR sent_at IS NOT NULL),
 CHECK (status<>'PENDING' OR recipient_user_id IS NOT NULL)
);
CREATE INDEX round_result_line_due ON round_result_line_outbox(next_attempt_at,entry_id) WHERE status IN ('PENDING','SENDING','FAILED');
REVOKE ALL ON round_result_line_outbox FROM PUBLIC;
