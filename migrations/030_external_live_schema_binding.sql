-- Keep tenant bindings in the same schema as the LIVE tables. This also
-- supports isolated-schema integration tests without touching public data.
DO $$
DECLARE schema_name name := current_schema();
BEGIN
 EXECUTE format(
  'CREATE OR REPLACE FUNCTION %I.external_live_is_bound(target_oa uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,%I AS %L',
  schema_name, schema_name,
  'SELECT EXISTS (SELECT 1 FROM external_live_role_bindings b WHERE b.role_name = session_user AND b.oa_id = target_oa)');
END $$;
