-- Apply after 003_ocr_evidence.sql. No prior migration is changed.
ALTER TABLE round_ocr_evidence ADD COLUMN verification_status text NOT NULL DEFAULT 'PENDING'
 CHECK (verification_status IN ('PENDING','VERIFIED','REVIEW_REQUIRED')),
 ADD COLUMN verified_at timestamptz,
 ADD CONSTRAINT evidence_verified_timestamp CHECK ((verification_status='VERIFIED')=(verified_at IS NOT NULL));
CREATE INDEX round_ocr_evidence_public_idx ON round_ocr_evidence(round_id,captured_at,id)
 WHERE verification_status='VERIFIED';
CREATE UNIQUE INDEX round_audit_one_settlement ON round_audit_logs(round_id)
 WHERE action='ROUND_SETTLED';
CREATE FUNCTION forbid_round_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'round audit is append-only'; END$$;
CREATE TRIGGER round_audit_immutable BEFORE UPDATE OR DELETE ON round_audit_logs FOR EACH ROW EXECUTE FUNCTION forbid_round_audit_mutation();
REVOKE ALL ON round_ocr_evidence,round_audit_logs FROM PUBLIC;
-- Event names reserved for real transitions only:
-- OCR_SCAN_STARTED, OCR_FRAME_ACCEPTED, OCR_FRAME_REJECTED, OCR_VERIFIED,
-- OCR_REVIEW_REQUIRED, EVIDENCE_STORED, RESULT_CONFIRMED,
-- ROUND_SETTLED, ROUND_CANCELLED. This migration emits none of them.
