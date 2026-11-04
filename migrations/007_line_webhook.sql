CREATE TABLE line_webhook_events (
 event_id text PRIMARY KEY,
 event_type text NOT NULL CHECK (event_type IN ('follow','unfollow','message')),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX line_webhook_events_created_idx ON line_webhook_events(created_at);
REVOKE ALL ON line_webhook_events FROM PUBLIC;
