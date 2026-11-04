-- New uploads only: historical production slips are not enrolled for deletion.
CREATE TABLE member_topup_slip_retention (
 request_id uuid PRIMARY KEY REFERENCES member_topup_requests(id),
 object_key text NOT NULL CHECK (object_key LIKE 'topup-slips/%' AND object_key NOT LIKE '%..%'),
 expires_at timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE','PROCESSING','RETRY','PURGED')),
 legal_hold boolean NOT NULL DEFAULT false,
 hold_reason text CHECK (length(hold_reason)<=500),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 purged_at timestamptz,
 last_error text CHECK (length(last_error)<=100),
 CHECK ((state='PURGED')=(purged_at IS NOT NULL))
);
CREATE INDEX member_topup_slip_cleanup ON member_topup_slip_retention(expires_at,next_attempt_at) WHERE state<>'PURGED' AND legal_hold=false;
REVOKE ALL ON member_topup_slip_retention FROM PUBLIC;
ALTER TABLE member_topup_slip_retention ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_topup_slip_retention FORCE ROW LEVEL SECURITY;
CREATE POLICY topup_retention_admin ON member_topup_slip_retention USING (current_setting('pair_live.topup_admin',true)='true') WITH CHECK (current_setting('pair_live.topup_admin',true)='true');
CREATE POLICY topup_retention_member_insert ON member_topup_slip_retention FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM member_topup_requests r WHERE r.id=request_id AND r.member_id=NULLIF(current_setting('pair_live.member_id',true),'')::uuid));
CREATE INDEX member_topup_history_export ON member_topup_requests(created_at,id);
