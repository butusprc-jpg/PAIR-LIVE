-- Forward only: LINE postback event IDs share the verified webhook event log.
ALTER TABLE line_webhook_events DROP CONSTRAINT line_webhook_events_event_type_check;
ALTER TABLE line_webhook_events ADD CONSTRAINT line_webhook_events_event_type_check
 CHECK(event_type IN ('follow','unfollow','message','postback'));
CREATE TABLE member_topup_chat_actions (
 event_id text PRIMARY KEY REFERENCES line_webhook_events(event_id),
 request_id uuid REFERENCES member_topup_requests(id),
 admin_id uuid REFERENCES admin_identities(id),
 actor_hash char(64) NOT NULL,
 stage text NOT NULL CHECK(stage IN ('REVIEW','CONFIRM','CANCEL','DENIED','INVALID')),
 decision text CHECK(decision IN ('APPROVED','REJECTED')),
 result text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON member_topup_chat_actions FROM PUBLIC;
ALTER TABLE member_topup_chat_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_topup_chat_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY topup_chat_audit_admin ON member_topup_chat_actions
 USING(current_setting('pair_live.topup_admin',true)='true')
 WITH CHECK(current_setting('pair_live.topup_admin',true)='true');
CREATE TRIGGER topup_chat_immutable BEFORE UPDATE OR DELETE ON member_topup_chat_actions
 FOR EACH ROW EXECUTE FUNCTION topup_immutable();
