-- LINE SHOPPING LIVE links are scoped to the owner's LINE OA; legacy LIVE data is retained.
CREATE TABLE line_shopping_live_channel_bindings (
 provider_channel_id text PRIMARY KEY CHECK (length(provider_channel_id) BETWEEN 1 AND 255),
 oa_id uuid NOT NULL UNIQUE REFERENCES oa_service_control(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE line_shopping_live_tenants (
 oa_id uuid PRIMARY KEY REFERENCES oa_service_control(id),
 live_url text,
 title text NOT NULL DEFAULT 'LINE SHOPPING LIVE' CHECK (length(title) BETWEEN 1 AND 160),
 display_enabled boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL DEFAULT 0 CHECK (revision>=0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text,
 CHECK (NOT display_enabled OR live_url IS NOT NULL)
);
CREATE TABLE line_shopping_live_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 oa_id uuid NOT NULL REFERENCES oa_service_control(id),
 revision bigint NOT NULL,
 actor text NOT NULL,
 action text NOT NULL CHECK (action IN ('SAVE','START','STOP')),
 before_state jsonb NOT NULL,
 after_state jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(oa_id,revision)
);
CREATE TRIGGER line_shopping_live_audit_immutable BEFORE UPDATE OR DELETE ON line_shopping_live_audit
 FOR EACH ROW EXECUTE FUNCTION topup_immutable();
REVOKE ALL ON line_shopping_live_channel_bindings,line_shopping_live_tenants,line_shopping_live_audit FROM PUBLIC;
ALTER TABLE line_shopping_live_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_shopping_live_tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY line_shopping_live_tenant_scope ON line_shopping_live_tenants
 USING (external_live_is_bound(oa_id)) WITH CHECK (external_live_is_bound(oa_id));
ALTER TABLE line_shopping_live_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_shopping_live_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY line_shopping_live_audit_scope ON line_shopping_live_audit
 USING (external_live_is_bound(oa_id)) WITH CHECK (external_live_is_bound(oa_id));
