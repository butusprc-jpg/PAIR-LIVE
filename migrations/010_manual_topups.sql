-- Forward only. No cutover state or wallet balance changes.
CREATE TABLE member_topup_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 member_id uuid NOT NULL REFERENCES members(id),
 requested_points integer NOT NULL CHECK(requested_points>0),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 idempotency_key uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 approved_at timestamptz, approved_by uuid REFERENCES admin_identities(id),
 rejected_at timestamptz, rejected_by uuid REFERENCES admin_identities(id),
 admin_note text NOT NULL DEFAULT '' CHECK(length(admin_note)<=1000),
 UNIQUE(member_id,idempotency_key),
 CHECK ((status='PENDING' AND approved_at IS NULL AND approved_by IS NULL AND rejected_at IS NULL AND rejected_by IS NULL)
 OR (status='APPROVED' AND approved_at IS NOT NULL AND approved_by IS NOT NULL AND rejected_at IS NULL AND rejected_by IS NULL)
 OR (status='REJECTED' AND rejected_at IS NOT NULL AND rejected_by IS NOT NULL AND approved_at IS NULL AND approved_by IS NULL))
);
CREATE INDEX member_topup_queue ON member_topup_requests(status,created_at DESC);
CREATE INDEX member_topup_owner ON member_topup_requests(member_id,created_at DESC);
CREATE TABLE member_topup_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL UNIQUE REFERENCES member_topup_requests(id),
 member_id uuid NOT NULL REFERENCES members(id),
 admin_id uuid NOT NULL REFERENCES admin_identities(id),
 action text NOT NULL CHECK(action IN ('APPROVED','REJECTED')),
 points integer NOT NULL CHECK(points>0),
 balance_before integer NOT NULL CHECK(balance_before>=0),
 balance_after integer NOT NULL CHECK(balance_after>=0),
 admin_note text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((action='APPROVED' AND balance_after::bigint=balance_before::bigint+points) OR (action='REJECTED' AND balance_after=balance_before))
);
CREATE TABLE member_topup_qr_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), object_key text NOT NULL UNIQUE,
 content_type text NOT NULL CHECK(content_type IN ('image/png','image/jpeg','image/webp')),
 sha256 text NOT NULL CHECK(length(sha256)=64),
 updated_by uuid NOT NULL REFERENCES admin_identities(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE member_topup_qr_current(id integer PRIMARY KEY CHECK(id=1),version_id uuid NOT NULL REFERENCES member_topup_qr_versions(id));
CREATE FUNCTION topup_immutable() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'topup_immutable'; END$$;
CREATE TRIGGER topup_audit_immutable BEFORE UPDATE OR DELETE ON member_topup_audit FOR EACH ROW EXECUTE FUNCTION topup_immutable();
CREATE TRIGGER topup_qr_history_immutable BEFORE UPDATE OR DELETE ON member_topup_qr_versions FOR EACH ROW EXECUTE FUNCTION topup_immutable();
CREATE FUNCTION topup_transition() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'topup_immutable'; END IF;
 IF OLD.status<>'PENDING' OR NEW.member_id<>OLD.member_id OR NEW.requested_points<>OLD.requested_points OR NEW.idempotency_key<>OLD.idempotency_key OR NEW.id<>OLD.id OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'topup_immutable'; END IF;
 RETURN NEW; END$$;
CREATE TRIGGER topup_terminal BEFORE UPDATE OR DELETE ON member_topup_requests FOR EACH ROW EXECUTE FUNCTION topup_transition();
REVOKE ALL ON member_topup_requests,member_topup_audit,member_topup_qr_versions,member_topup_qr_current FROM PUBLIC;
ALTER TABLE member_topup_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_topup_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY topup_scoped ON member_topup_requests USING(member_id=NULLIF(current_setting('pair_live.member_id',true),'')::uuid OR current_setting('pair_live.topup_admin',true)='true') WITH CHECK(member_id=NULLIF(current_setting('pair_live.member_id',true),'')::uuid OR current_setting('pair_live.topup_admin',true)='true');
ALTER TABLE member_topup_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_topup_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY topup_audit_admin ON member_topup_audit USING(current_setting('pair_live.topup_admin',true)='true') WITH CHECK(current_setting('pair_live.topup_admin',true)='true');
