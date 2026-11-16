-- A one-shot result has one capture after the server-side settling delay.
ALTER TABLE round_ocr_candidate_locks DROP CONSTRAINT round_ocr_candidate_locks_check2;
ALTER TABLE round_ocr_candidate_locks ADD CONSTRAINT round_ocr_candidate_locks_last_captured_at_check CHECK (last_captured_at>=first_captured_at);
ALTER TABLE round_ocr_candidate_locks DROP CONSTRAINT round_ocr_candidate_locks_frame_count_check;
ALTER TABLE round_ocr_candidate_locks ADD CONSTRAINT round_ocr_candidate_locks_frame_count_check CHECK (frame_count>=1);

-- Claim before opening the camera, so a restarted worker cannot capture twice.
CREATE TABLE round_ocr_one_shot_claims (
 round_id bigint PRIMARY KEY REFERENCES rounds(id) ON DELETE RESTRICT,
 claimed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER round_ocr_one_shot_claim_immutable BEFORE UPDATE OR DELETE ON round_ocr_one_shot_claims FOR EACH ROW EXECUTE FUNCTION forbid_round_ocr_candidate_mutation();
REVOKE ALL ON round_ocr_one_shot_claims FROM PUBLIC;
