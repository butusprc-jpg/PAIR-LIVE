-- READ ONLY. Run against the explicitly selected Neon production branch/database.
-- Never interpret a database name alone as proof of the target branch.
SELECT current_database() AS database_name, current_user AS login_role,
       inet_server_addr() AS server_address, current_setting('server_version') AS postgres_version;
SELECT path,sha256,applied_at FROM schema_migration_history
 WHERE path IN (
  'migrations/032_vdo_ninja_live.sql',
  'migrations/033_line_shopping_live.sql',
  'migrations/034_vdo_ninja_tenants.sql',
  'migrations/035_vdo_remote_control.sql',
  'migrations/036_member_remember_session.sql',
  'migrations/040_camera_sites.sql') ORDER BY path;
SELECT to_regclass('public.external_live_settings') AS external_live_settings,
       to_regclass('public.oa_service_control') AS oa_service_control,
       to_regclass('public.member_sessions') AS member_sessions,
       to_regclass('public.vdo_ninja_tenants') AS vdo_ninja_tenants,
       to_regclass('public.camera_sites') AS camera_sites;
SELECT phase,enabled,ever_cutover FROM member_wallet_runtime_state WHERE id=1;
