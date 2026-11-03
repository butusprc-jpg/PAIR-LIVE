-- Apply after 002_round_engine.sql. Existing migrations are unchanged.
ALTER TABLE rounds ADD COLUMN result_last_digit char(1), ADD COLUMN result_parity text,
 ADD COLUMN result_confidence numeric(5,2), ADD COLUMN result_verified_at timestamptz;
ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_result_number_check;
ALTER TABLE rounds ADD CONSTRAINT rounds_result_number_check CHECK (result_number IS NULL OR result_number ~ '^[0-9]+(\.[0-9]+)?$');
ALTER TABLE rounds ADD CONSTRAINT rounds_result_consistency CHECK (
 (result_number IS NULL AND result_last_digit IS NULL AND result_parity IS NULL AND result_confidence IS NULL AND result_verified_at IS NULL)
 OR (status='SETTLED' AND result_number ~ '^[0-9]+(\.[0-9]+)?$' AND result_last_digit = right(result_number,1)
 AND result_parity IN ('EVEN','ODD') AND result_confidence BETWEEN 0 AND 100 AND result_verified_at IS NOT NULL));
CREATE TABLE round_ocr_evidence (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 round_id bigint NOT NULL REFERENCES rounds(id), frame_id text NOT NULL,
 source_type text NOT NULL CHECK (source_type IN ('MOBILE_CAMERA','IP_CAMERA','NVR_DVR','CLOUD_CAMERA')),
 captured_at timestamptz NOT NULL, raw_ocr_text text NOT NULL, normalized_text text NOT NULL,
 confidence numeric(5,2) NOT NULL CHECK (confidence BETWEEN 0 AND 100),
 original_sha256 char(64) NOT NULL, crop_sha256 char(64) NOT NULL,
 original_object_key text NOT NULL, crop_object_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(round_id,frame_id)
);
CREATE INDEX round_ocr_evidence_round_idx ON round_ocr_evidence(round_id,captured_at);
CREATE FUNCTION forbid_ocr_evidence_mutation() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'OCR evidence is immutable'; END$$;
CREATE TRIGGER round_ocr_evidence_immutable BEFORE UPDATE OR DELETE ON round_ocr_evidence FOR EACH ROW EXECUTE FUNCTION forbid_ocr_evidence_mutation();
REVOKE ALL ON round_ocr_evidence FROM PUBLIC;
-- No public settlement endpoint. Server-side admin authorization is required before a settlement worker can be enabled.
