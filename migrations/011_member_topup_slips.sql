-- Forward-only. Existing requests remain readable; new requests carry private slip metadata.
ALTER TABLE member_topup_requests
 ADD COLUMN slip_object_key text,
 ADD COLUMN slip_content_type text,
 ADD COLUMN slip_sha256 text;
ALTER TABLE member_topup_requests
 ADD CONSTRAINT topup_slip_complete CHECK (
  (slip_object_key IS NULL AND slip_content_type IS NULL AND slip_sha256 IS NULL)
  OR (slip_object_key IS NOT NULL AND slip_content_type IN ('image/png','image/jpeg','image/webp') AND length(slip_sha256)=64)
 );
CREATE UNIQUE INDEX member_topup_slip_object_unique ON member_topup_requests(slip_object_key) WHERE slip_object_key IS NOT NULL;
