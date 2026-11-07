-- V12 keeps the legacy singleton untouched; the new module starts READY only after an admin saves a URL.
CREATE TABLE external_live_tenants (
 oa_id uuid PRIMARY KEY REFERENCES oa_service_control(id),
 video_id varchar(11) CHECK (video_id ~ '^[A-Za-z0-9_-]{11}$'),
 status text NOT NULL DEFAULT 'OFFLINE' CHECK (status IN ('OFFLINE','READY','SHOWING','INTERMISSION')),
 mode text NOT NULL DEFAULT 'MANUAL' CHECK (mode IN ('MANUAL','AUTO')),
 show_seconds integer NOT NULL DEFAULT 90 CHECK (show_seconds BETWEEN 10 AND 3600),
 break_seconds integer NOT NULL DEFAULT 30 CHECK (break_seconds BETWEEN 1 AND 3600),
 started_at timestamptz,
 revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (status <> 'SHOWING' AND status <> 'INTERMISSION' OR video_id IS NOT NULL AND started_at IS NOT NULL)
);
CREATE TABLE external_live_tenant_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 oa_id uuid NOT NULL REFERENCES oa_service_control(id),
 revision bigint NOT NULL,
 actor text NOT NULL,
 action text NOT NULL CHECK (action IN ('SAVE','START','STOP','SETTINGS','OA_INACTIVE')),
 before_state jsonb,
 after_state jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (oa_id, revision)
);
CREATE TRIGGER external_live_audit_immutable BEFORE UPDATE OR DELETE ON external_live_tenant_audit
 FOR EACH ROW EXECUTE FUNCTION topup_immutable();
REVOKE ALL ON external_live_tenants,external_live_tenant_audit FROM PUBLIC;
ALTER TABLE external_live_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_live_tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY external_live_tenant_scope ON external_live_tenants
 USING (oa_id = nullif(current_setting('pair_live.external_live_oa',true),'')::uuid)
 WITH CHECK (oa_id = nullif(current_setting('pair_live.external_live_oa',true),'')::uuid);
ALTER TABLE external_live_tenant_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_live_tenant_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY external_live_audit_scope ON external_live_tenant_audit
 USING (oa_id = nullif(current_setting('pair_live.external_live_oa',true),'')::uuid)
 WITH CHECK (oa_id = nullif(current_setting('pair_live.external_live_oa',true),'')::uuid);
