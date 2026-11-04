-- Persistent LINE delivery queue. Notification status never changes wallet balances.
CREATE TABLE member_topup_line_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES member_topup_requests(id),
 member_id uuid NOT NULL REFERENCES members(id),
 recipient_user_id text NOT NULL CHECK (recipient_user_id ~ '^U[0-9a-fA-F]{32}$'),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','RETRY','SENT','FAILED')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0 AND attempts<=5),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz,
 UNIQUE(request_id,recipient_user_id)
);
CREATE INDEX member_topup_line_delivery_queue ON member_topup_line_notifications(status,next_attempt_at,created_at);
REVOKE ALL ON member_topup_line_notifications FROM PUBLIC;
ALTER TABLE member_topup_line_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_topup_line_notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY topup_notify_admin_read ON member_topup_line_notifications FOR SELECT USING (current_setting('pair_live.topup_admin',true)='true');
CREATE POLICY topup_notify_member_insert ON member_topup_line_notifications FOR INSERT WITH CHECK (member_id=NULLIF(current_setting('pair_live.member_id',true),'')::uuid OR current_setting('pair_live.topup_admin',true)='true');
CREATE POLICY topup_notify_admin_update ON member_topup_line_notifications FOR UPDATE USING (current_setting('pair_live.topup_admin',true)='true') WITH CHECK (current_setting('pair_live.topup_admin',true)='true');
