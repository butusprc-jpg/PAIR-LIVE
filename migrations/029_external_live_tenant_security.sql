-- Database login identity, rather than a mutable session setting, selects the OA.
-- Bind a dedicated login role to at most one OA. Only the database owner may
-- manage bindings; unbound roles see no rows, including after changing a GUC.
CREATE TABLE external_live_role_bindings (
 role_name name PRIMARY KEY,
 oa_id uuid NOT NULL REFERENCES oa_service_control(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON external_live_role_bindings FROM PUBLIC;
ALTER TABLE external_live_role_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_live_role_bindings FORCE ROW LEVEL SECURITY;
CREATE FUNCTION external_live_is_bound(target_oa uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
 AS 'SELECT EXISTS (SELECT 1 FROM public.external_live_role_bindings b WHERE b.role_name = session_user AND b.oa_id = target_oa)';
REVOKE ALL ON FUNCTION external_live_is_bound(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION external_live_is_bound(uuid) TO PUBLIC;
DROP POLICY external_live_tenant_scope ON external_live_tenants;
CREATE POLICY external_live_tenant_scope ON external_live_tenants
 USING (external_live_is_bound(oa_id))
 WITH CHECK (external_live_is_bound(oa_id));
DROP POLICY external_live_audit_scope ON external_live_tenant_audit;
CREATE POLICY external_live_audit_scope ON external_live_tenant_audit
 USING (external_live_is_bound(oa_id))
 WITH CHECK (external_live_is_bound(oa_id));
