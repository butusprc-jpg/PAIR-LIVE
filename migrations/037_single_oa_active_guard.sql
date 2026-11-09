-- A single deployment owns one enabled OA. Refuse an existing ambiguous
-- database rather than guessing ownership or changing historical records.
CREATE UNIQUE INDEX oa_single_enabled_guard ON oa_service_control ((true))
 WHERE enabled=true AND deleted_at IS NULL;
