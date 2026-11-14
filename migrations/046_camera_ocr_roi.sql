-- Per-camera OCR area. Coordinates are 0..10000 fractions of the decoded frame.
-- This configuration does not enable OCR, settlement, or any worker.
CREATE TABLE camera_ocr_roi (
 camera_id uuid PRIMARY KEY,
 oa_id uuid NOT NULL,
 x integer NOT NULL CHECK (x BETWEEN 0 AND 10000),
 y integer NOT NULL CHECK (y BETWEEN 0 AND 10000),
 width integer NOT NULL CHECK (width BETWEEN 1 AND 10000),
 height integer NOT NULL CHECK (height BETWEEN 1 AND 10000),
 revision bigint NOT NULL DEFAULT 1 CHECK (revision>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid NOT NULL REFERENCES admin_identities(id),
 FOREIGN KEY (oa_id,camera_id) REFERENCES site_cameras(oa_id,camera_id) ON DELETE RESTRICT,
 CHECK (x+width<=10000 AND y+height<=10000)
);
CREATE INDEX camera_ocr_roi_oa_idx ON camera_ocr_roi(oa_id);
REVOKE ALL ON camera_ocr_roi FROM PUBLIC;
