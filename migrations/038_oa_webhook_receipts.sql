-- Scoped receipt log; legacy postbacks remain on the legacy endpoint until
-- their financial request rows can be bound to an unambiguous OA.
CREATE TABLE oa_line_webhook_receipts (
 oa_id uuid NOT NULL REFERENCES oa_service_control(id),
 event_id text NOT NULL CHECK (length(event_id) BETWEEN 1 AND 180),
 event_type text NOT NULL CHECK (event_type IN ('follow','unfollow','message')),
 received_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (oa_id,event_id)
);
REVOKE ALL ON oa_line_webhook_receipts FROM PUBLIC;
