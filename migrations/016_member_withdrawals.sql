-- Withdrawal requests are distinct from top-up. The member's legacy available
-- points are held when the request is created; rejection returns the hold.
CREATE TABLE member_withdrawal_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 member_id uuid NOT NULL REFERENCES members(id),
 requested_points integer NOT NULL CHECK(requested_points>0),
 payout_details varchar(50) NOT NULL CHECK(length(btrim(payout_details)) BETWEEN 1 AND 50),
 idempotency_key uuid NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','TRANSFERRED','REJECTED')),
 created_at timestamptz NOT NULL DEFAULT now(),
 decided_at timestamptz,
 decided_by uuid REFERENCES admin_identities(id),
 UNIQUE(member_id,idempotency_key),
 CHECK ((status='PENDING' AND decided_at IS NULL AND decided_by IS NULL) OR
        (status<>'PENDING' AND decided_at IS NOT NULL AND decided_by IS NOT NULL))
);
CREATE INDEX member_withdrawal_member_idx ON member_withdrawal_requests(member_id,created_at DESC);
CREATE INDEX member_withdrawal_pending_idx ON member_withdrawal_requests(status,created_at DESC);
CREATE TABLE member_withdrawal_audit (
 request_id uuid PRIMARY KEY REFERENCES member_withdrawal_requests(id),
 member_id uuid NOT NULL REFERENCES members(id),
 admin_id uuid NOT NULL REFERENCES admin_identities(id),
 action text NOT NULL CHECK(action IN ('TRANSFERRED','REJECTED')),
 points integer NOT NULL CHECK(points>0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER withdrawal_audit_immutable BEFORE UPDATE OR DELETE ON member_withdrawal_audit
 FOR EACH ROW EXECUTE FUNCTION topup_immutable();
CREATE FUNCTION withdrawal_terminal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.status<>'PENDING' OR NEW.id<>OLD.id OR
    NEW.member_id<>OLD.member_id OR NEW.requested_points<>OLD.requested_points OR
    NEW.payout_details<>OLD.payout_details OR NEW.idempotency_key<>OLD.idempotency_key OR
    NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'withdrawal_immutable'; END IF;
 RETURN NEW;
END$$;
CREATE TRIGGER withdrawal_transition BEFORE UPDATE OR DELETE ON member_withdrawal_requests
 FOR EACH ROW EXECUTE FUNCTION withdrawal_terminal();
CREATE TABLE member_withdrawal_line_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES member_withdrawal_requests(id),
 recipient_user_id text NOT NULL CHECK(recipient_user_id ~ '^U[0-9a-fA-F]{32}$'),
 purpose text NOT NULL CHECK(purpose IN ('ADMIN_REQUEST','MEMBER_TRANSFERRED','MEMBER_REJECTED')),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENT','RETRY','FAILED','PROCESSING')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 sent_at timestamptz,
 last_error text,
 UNIQUE(request_id,recipient_user_id,purpose)
);
CREATE TABLE member_withdrawal_postbacks (
 event_id text PRIMARY KEY,
 request_id uuid REFERENCES member_withdrawal_requests(id),
 result text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON member_withdrawal_requests,member_withdrawal_audit,member_withdrawal_line_outbox,member_withdrawal_postbacks FROM PUBLIC;
ALTER TABLE member_withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_withdrawal_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY withdrawal_scoped ON member_withdrawal_requests
 USING(member_id=NULLIF(current_setting('pair_live.member_id',true),'')::uuid OR current_setting('pair_live.topup_admin',true)='true')
 WITH CHECK(member_id=NULLIF(current_setting('pair_live.member_id',true),'')::uuid OR current_setting('pair_live.topup_admin',true)='true');
ALTER TABLE member_withdrawal_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_withdrawal_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY withdrawal_audit_admin ON member_withdrawal_audit
 USING(current_setting('pair_live.topup_admin',true)='true') WITH CHECK(current_setting('pair_live.topup_admin',true)='true');
ALTER TABLE member_withdrawal_line_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_withdrawal_line_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY withdrawal_outbox_admin ON member_withdrawal_line_outbox
 USING(current_setting('pair_live.topup_admin',true)='true') WITH CHECK(current_setting('pair_live.topup_admin',true)='true');
ALTER TABLE member_withdrawal_postbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_withdrawal_postbacks FORCE ROW LEVEL SECURITY;
CREATE POLICY withdrawal_postback_admin ON member_withdrawal_postbacks
 USING(current_setting('pair_live.topup_admin',true)='true') WITH CHECK(current_setting('pair_live.topup_admin',true)='true');
