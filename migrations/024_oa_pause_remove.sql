-- V10: reversible pause and audited soft removal. No wallet/member/ledger deletes.
ALTER TABLE oa_service_control
 ADD COLUMN paused boolean NOT NULL DEFAULT false,
 ADD COLUMN deleted_at timestamptz;
ALTER TABLE oa_service_audit DROP CONSTRAINT IF EXISTS oa_service_audit_action_check;
ALTER TABLE oa_service_audit ADD CONSTRAINT oa_service_audit_action_check
 CHECK (action IN ('ADD','ENABLE','DISABLE','PAUSE','RESUME','REMOVE','SET_EXPIRY','EXTEND_30_DAYS'));
CREATE INDEX IF NOT EXISTS oa_service_visible_idx ON oa_service_control(created_at DESC)
 WHERE deleted_at IS NULL;
