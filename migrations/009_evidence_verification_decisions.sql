-- Forward-only: original OCR evidence and its immutable trigger remain intact.
CREATE TABLE round_ocr_verification_decisions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 evidence_id bigint NOT NULL UNIQUE REFERENCES round_ocr_evidence(id) ON DELETE RESTRICT,
 decision text NOT NULL CHECK (decision IN ('VERIFIED','REVIEW_REQUIRED')),
 actor text NOT NULL CHECK (length(trim(actor))>0),
 reason text,
 decided_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX round_ocr_verification_decisions_decided_idx ON round_ocr_verification_decisions(decided_at,id);
CREATE FUNCTION forbid_ocr_verification_decision_mutation() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'OCR verification decision is append-only'; END$$;
CREATE TRIGGER round_ocr_verification_decisions_immutable BEFORE UPDATE OR DELETE ON round_ocr_verification_decisions FOR EACH ROW EXECUTE FUNCTION forbid_ocr_verification_decision_mutation();
REVOKE ALL ON round_ocr_verification_decisions FROM PUBLIC;
REVOKE ALL ON SEQUENCE round_ocr_verification_decisions_id_seq FROM PUBLIC;
-- No INSERT grant to a browser/member role. A future admin-authorized server
-- action may insert one decision per evidence row after verifying image hashes.
