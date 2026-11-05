-- Persist roles while retaining the existing allowlist for bootstrap only.
ALTER TABLE admin_identities ADD COLUMN role text CHECK (role IN ('admin','operator','viewer'));
CREATE TABLE admin_role_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES admin_identities(id),
 target_id uuid NOT NULL REFERENCES admin_identities(id),
 action text NOT NULL CHECK (action IN ('added','role_changed','disabled','enabled')),
 previous_role text CHECK (previous_role IN ('admin','operator','viewer')),
 next_role text CHECK (next_role IN ('admin','operator','viewer')),
 previous_status text CHECK (previous_status IN ('active','disabled')),
 next_status text CHECK (next_status IN ('active','disabled')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_role_audit_time_idx ON admin_role_audit(created_at DESC,id DESC);
REVOKE ALL ON admin_role_audit FROM PUBLIC;
-- A separate runtime role needs SELECT/INSERT on admin_role_audit and USAGE on
-- admin_role_audit_id_seq, plus SELECT/UPDATE(role,status) on admin_identities.
-- Apply those grants only to the private runtime role used by the deployment.
