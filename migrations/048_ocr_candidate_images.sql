-- Private, deletable image copies for a preliminary OCR lock. Settlement evidence remains separate.
CREATE TABLE round_ocr_candidate_images (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 round_id bigint NOT NULL UNIQUE REFERENCES round_ocr_candidate_locks(round_id) ON DELETE RESTRICT,
 oa_id uuid NOT NULL REFERENCES oa_service_control(id) ON DELETE RESTRICT,
 camera_id uuid NOT NULL,
 source_kind text NOT NULL CHECK (source_kind IN ('VDO_NINJA','IP_CAMERA','RTSP_GATEWAY')),
 source_id text NOT NULL CHECK (length(source_id) BETWEEN 1 AND 255),
 frame_id text NOT NULL CHECK (length(frame_id) BETWEEN 1 AND 128),
 captured_at timestamptz NOT NULL,
 full_text text NOT NULL CHECK (full_text ~ '^[0-9]+(\.[0-9]+)?$'),
 last_digit char(1) NOT NULL CHECK (last_digit=right(full_text,1)),
 parity text NOT NULL CHECK (parity IN ('EVEN','ODD')),
 confidence numeric(5,2) NOT NULL CHECK (confidence BETWEEN 75 AND 100),
 original_sha256 char(64) NOT NULL CHECK (original_sha256 ~ '^[0-9a-f]{64}$'),
 crop_sha256 char(64) NOT NULL CHECK (crop_sha256 ~ '^[0-9a-f]{64}$'),
 original_object_key text NOT NULL UNIQUE,
 crop_object_key text NOT NULL UNIQUE,
 original_bytes integer NOT NULL CHECK (original_bytes BETWEEN 45 AND 5242880),
 crop_bytes integer NOT NULL CHECK (crop_bytes BETWEEN 45 AND 5242880),
 status text NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','DELETING','DELETED')),
 delete_requested_by uuid REFERENCES admin_identities(id),
 delete_requested_at timestamptz,
 deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(oa_id,camera_id) REFERENCES site_cameras(oa_id,camera_id) ON DELETE RESTRICT,
 CHECK (original_object_key ~ '^private/ocr/[0-9a-f-]{36}/[0-9]+/[0-9a-f]{64}/full\.png$'),
 CHECK (crop_object_key ~ '^private/ocr/[0-9a-f-]{36}/[0-9]+/[0-9a-f]{64}/crop\.png$'),
 CHECK ((status='AVAILABLE' AND deleted_at IS NULL) OR (status='DELETING' AND delete_requested_by IS NOT NULL AND delete_requested_at IS NOT NULL AND deleted_at IS NULL) OR (status='DELETED' AND delete_requested_by IS NOT NULL AND deleted_at IS NOT NULL))
);
CREATE INDEX round_ocr_candidate_images_oa_round_idx ON round_ocr_candidate_images(oa_id,round_id DESC);
CREATE FUNCTION guard_round_ocr_image_change() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'ocr_image_metadata_immutable'; END IF;
 IF (to_jsonb(NEW) - 'status' - 'delete_requested_by' - 'delete_requested_at' - 'deleted_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'delete_requested_by' - 'delete_requested_at' - 'deleted_at') THEN RAISE EXCEPTION 'ocr_image_metadata_immutable'; END IF;
 IF NOT ((OLD.status='AVAILABLE' AND NEW.status='DELETING') OR (OLD.status='DELETING' AND NEW.status IN ('AVAILABLE','DELETED'))) THEN RAISE EXCEPTION 'ocr_image_status_transition_invalid'; END IF;
 RETURN NEW;
END$$;
CREATE TRIGGER round_ocr_image_guard BEFORE UPDATE OR DELETE ON round_ocr_candidate_images FOR EACH ROW EXECUTE FUNCTION guard_round_ocr_image_change();
CREATE TABLE round_ocr_image_delete_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 image_id uuid NOT NULL REFERENCES round_ocr_candidate_images(id) ON DELETE RESTRICT,
 round_id bigint NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT,
 oa_id uuid NOT NULL REFERENCES oa_service_control(id) ON DELETE RESTRICT,
 actor uuid NOT NULL REFERENCES admin_identities(id),
 action text NOT NULL CHECK (action IN ('DELETE_REQUESTED','DELETE_FAILED','DELETE_COMPLETED')),
 detail text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION forbid_round_ocr_delete_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'ocr_delete_audit_immutable'; END$$;
CREATE TRIGGER round_ocr_delete_audit_guard BEFORE UPDATE OR DELETE ON round_ocr_image_delete_audit FOR EACH ROW EXECUTE FUNCTION forbid_round_ocr_delete_audit_change();
REVOKE ALL ON round_ocr_candidate_images,round_ocr_image_delete_audit FROM PUBLIC;
