-- One preliminary OCR lock per closed round. This is not verified evidence or settlement.
CREATE TABLE round_ocr_candidate_locks (
 round_id bigint PRIMARY KEY REFERENCES rounds(id) ON DELETE RESTRICT,
 oa_id uuid NOT NULL REFERENCES oa_service_control(id) ON DELETE RESTRICT,
 camera_id uuid NOT NULL,
 full_text text NOT NULL CHECK (full_text ~ '^[0-9]+(\.[0-9]+)?$'),
 last_digit char(1) NOT NULL CHECK (last_digit ~ '^[0-9]$' AND last_digit=right(full_text,1)),
 parity text NOT NULL CHECK (parity IN ('EVEN','ODD') AND (parity='EVEN')=(last_digit ~ '[02468]')),
 confidence numeric(5,2) NOT NULL CHECK (confidence BETWEEN 75 AND 100),
 first_captured_at timestamptz NOT NULL,
 last_captured_at timestamptz NOT NULL CHECK (last_captured_at>=first_captured_at+interval '3 seconds'),
 frame_count integer NOT NULL CHECK (frame_count>=5),
 last_frame_sha256 char(64) NOT NULL CHECK (last_frame_sha256 ~ '^[0-9a-f]{64}$'),
 locked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(oa_id,camera_id) REFERENCES site_cameras(oa_id,camera_id) ON DELETE RESTRICT
);
CREATE FUNCTION forbid_round_ocr_candidate_mutation() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'round_ocr_candidate_immutable'; END$$;
CREATE TRIGGER round_ocr_candidate_immutable BEFORE UPDATE OR DELETE ON round_ocr_candidate_locks FOR EACH ROW EXECUTE FUNCTION forbid_round_ocr_candidate_mutation();
REVOKE ALL ON round_ocr_candidate_locks FROM PUBLIC;
