-- Link trusted server-captured candidate images to immutable verified evidence.
ALTER TABLE round_ocr_evidence DROP CONSTRAINT round_ocr_evidence_source_type_check;
ALTER TABLE round_ocr_evidence ADD CONSTRAINT round_ocr_evidence_source_type_check
 CHECK (source_type IN ('MOBILE_CAMERA','IP_CAMERA','NVR_DVR','CLOUD_CAMERA','VDO_NINJA','RTSP_GATEWAY'));
ALTER TABLE round_ocr_evidence ADD COLUMN candidate_image_id uuid UNIQUE
 REFERENCES round_ocr_candidate_images(id) ON DELETE RESTRICT;
