-- Per-OA VDO.Ninja state. Prior singleton and LINE SHOPPING data remain untouched.
CREATE TABLE vdo_ninja_channel_bindings (
 provider_channel_id text PRIMARY KEY CHECK (length(provider_channel_id) BETWEEN 1 AND 255),
 oa_id uuid NOT NULL UNIQUE REFERENCES oa_service_control(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE vdo_ninja_tenants (
 oa_id uuid PRIMARY KEY REFERENCES oa_service_control(id),
 stream_id text NOT NULL UNIQUE CHECK (stream_id ~ '^[A-Za-z0-9_-]{7,64}$'),
 display_enabled boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text
);
CREATE TABLE vdo_ninja_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 oa_id uuid NOT NULL REFERENCES oa_service_control(id),
 revision bigint NOT NULL,
 actor text NOT NULL,
 action text NOT NULL CHECK (action IN ('START','STOP')),
 before_state jsonb NOT NULL,
 after_state jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (oa_id,revision)
);
CREATE TRIGGER vdo_ninja_audit_immutable BEFORE UPDATE OR DELETE ON vdo_ninja_audit
 FOR EACH ROW EXECUTE FUNCTION topup_immutable();
REVOKE ALL ON vdo_ninja_channel_bindings,vdo_ninja_tenants,vdo_ninja_audit FROM PUBLIC;
ALTER TABLE vdo_ninja_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE vdo_ninja_tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY vdo_ninja_tenant_scope ON vdo_ninja_tenants
 USING (external_live_is_bound(oa_id)) WITH CHECK (external_live_is_bound(oa_id));
ALTER TABLE vdo_ninja_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE vdo_ninja_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY vdo_ninja_audit_scope ON vdo_ninja_audit
 USING (external_live_is_bound(oa_id)) WITH CHECK (external_live_is_bound(oa_id));
