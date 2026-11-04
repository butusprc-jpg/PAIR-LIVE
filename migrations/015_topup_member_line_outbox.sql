-- Forward-only V5 member notification outbox. It does not alter balances or ledger.
CREATE TABLE member_topup_member_notifications (
 request_id uuid PRIMARY KEY REFERENCES member_topup_requests(id) ON DELETE RESTRICT,
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
 recipient_user_id text CHECK (recipient_user_id ~ '^U[0-9a-fA-F]{32}$'),
 approved_points integer NOT NULL CHECK (approved_points>0),
 status text NOT NULL CHECK (status IN ('PENDING','PROCESSING','SENT','RETRY','FAILED')),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz,
 CHECK ((status='PROCESSING')=(lease_until IS NOT NULL)),
 CHECK (recipient_user_id IS NOT NULL OR status='FAILED')
);
CREATE INDEX member_topup_member_notifications_due ON member_topup_member_notifications(status,next_attempt_at,created_at)
 WHERE status IN ('PENDING','RETRY','PROCESSING');
REVOKE ALL ON member_topup_member_notifications FROM PUBLIC;
ALTER TABLE member_topup_member_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_topup_member_notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY member_topup_member_notifications_admin ON member_topup_member_notifications
 USING (current_setting('pair_live.topup_admin',true)='true')
 WITH CHECK (current_setting('pair_live.topup_admin',true)='true');
