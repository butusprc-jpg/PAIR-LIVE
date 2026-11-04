-- A successful HTTP receipt is not proof of business processing.
ALTER TABLE line_webhook_events
 ADD COLUMN processing_status text NOT NULL DEFAULT 'RECEIVED'
  CHECK (processing_status IN ('RECEIVED','PROCESSED','FAILED')),
 ADD COLUMN processed_at timestamptz;
CREATE INDEX line_webhook_events_pending_idx ON line_webhook_events(created_at)
 WHERE processing_status IN ('RECEIVED','FAILED');
