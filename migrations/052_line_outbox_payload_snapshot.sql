-- Persist member message snapshots before the first provider attempt.
-- Old attempted rows have no recoverable original body: retain them for review.
ALTER TABLE live_start_line_outbox ADD COLUMN payload_locale text, ADD COLUMN payload_messages jsonb;
ALTER TABLE round_countdown_line_outbox ADD COLUMN payload_locale text, ADD COLUMN payload_messages jsonb;
ALTER TABLE round_result_line_outbox ADD COLUMN payload_locale text, ADD COLUMN payload_messages jsonb;
ALTER TABLE member_topup_member_notifications ADD COLUMN payload_locale text, ADD COLUMN payload_messages jsonb;
ALTER TABLE member_withdrawal_line_outbox ADD COLUMN payload_locale text, ADD COLUMN payload_messages jsonb;

ALTER TABLE live_start_line_outbox ADD CONSTRAINT live_start_payload_pair CHECK ((payload_locale IS NULL)=(payload_messages IS NULL));
ALTER TABLE round_countdown_line_outbox ADD CONSTRAINT countdown_payload_pair CHECK ((payload_locale IS NULL)=(payload_messages IS NULL));
ALTER TABLE round_result_line_outbox ADD CONSTRAINT result_payload_pair CHECK ((payload_locale IS NULL)=(payload_messages IS NULL));
ALTER TABLE member_topup_member_notifications ADD CONSTRAINT topup_payload_pair CHECK ((payload_locale IS NULL)=(payload_messages IS NULL));
ALTER TABLE member_withdrawal_line_outbox ADD CONSTRAINT withdrawal_payload_pair CHECK ((payload_locale IS NULL)=(payload_messages IS NULL));
ALTER TABLE live_start_line_outbox ADD CONSTRAINT live_start_payload_valid CHECK (payload_messages IS NULL OR (payload_locale IN ('th','zh-CN','en') AND jsonb_typeof(payload_messages)='array' AND jsonb_array_length(payload_messages)=1));
ALTER TABLE round_countdown_line_outbox ADD CONSTRAINT countdown_payload_valid CHECK (payload_messages IS NULL OR (payload_locale IN ('th','zh-CN','en') AND jsonb_typeof(payload_messages)='array' AND jsonb_array_length(payload_messages)=1));
ALTER TABLE round_result_line_outbox ADD CONSTRAINT result_payload_valid CHECK (payload_messages IS NULL OR (payload_locale IN ('th','zh-CN','en') AND jsonb_typeof(payload_messages)='array' AND jsonb_array_length(payload_messages)=1));
ALTER TABLE member_topup_member_notifications ADD CONSTRAINT topup_payload_valid CHECK (payload_messages IS NULL OR (payload_locale IN ('th','zh-CN','en') AND jsonb_typeof(payload_messages)='array' AND jsonb_array_length(payload_messages)=1));
ALTER TABLE member_withdrawal_line_outbox ADD CONSTRAINT withdrawal_payload_valid CHECK (payload_messages IS NULL OR (payload_locale IN ('th','zh-CN','en') AND jsonb_typeof(payload_messages)='array' AND jsonb_array_length(payload_messages)=1));

CREATE FUNCTION line_outbox_payload_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.payload_messages IS NOT NULL AND
   (NEW.payload_messages IS DISTINCT FROM OLD.payload_messages OR NEW.payload_locale IS DISTINCT FROM OLD.payload_locale OR NEW.recipient_user_id IS DISTINCT FROM OLD.recipient_user_id) THEN
  RAISE EXCEPTION 'line_outbox_payload_immutable';
 END IF;
 RETURN NEW;
END$$;
CREATE TRIGGER live_start_payload_immutable BEFORE UPDATE ON live_start_line_outbox FOR EACH ROW EXECUTE FUNCTION line_outbox_payload_immutable();
CREATE TRIGGER countdown_payload_immutable BEFORE UPDATE ON round_countdown_line_outbox FOR EACH ROW EXECUTE FUNCTION line_outbox_payload_immutable();
CREATE TRIGGER result_payload_immutable BEFORE UPDATE ON round_result_line_outbox FOR EACH ROW EXECUTE FUNCTION line_outbox_payload_immutable();
CREATE TRIGGER topup_payload_immutable BEFORE UPDATE ON member_topup_member_notifications FOR EACH ROW EXECUTE FUNCTION line_outbox_payload_immutable();
CREATE TRIGGER withdrawal_payload_immutable BEFORE UPDATE ON member_withdrawal_line_outbox FOR EACH ROW EXECUTE FUNCTION line_outbox_payload_immutable();

UPDATE live_start_line_outbox SET status='FAILED',attempts=5,lease_until=NULL,last_error='payload_snapshot_review_required'
 WHERE attempts BETWEEN 1 AND 4 AND payload_messages IS NULL AND status IN ('PENDING','FAILED','SENDING');
UPDATE round_countdown_line_outbox SET status='FAILED',attempts=5,lease_until=NULL,last_error='payload_snapshot_review_required',updated_at=now()
 WHERE attempts BETWEEN 1 AND 4 AND payload_messages IS NULL AND status IN ('PENDING','FAILED','SENDING');
UPDATE round_result_line_outbox SET status='UNDELIVERABLE',attempts=5,lease_until=NULL,last_error='payload_snapshot_review_required'
 WHERE attempts BETWEEN 1 AND 4 AND payload_messages IS NULL AND status IN ('PENDING','FAILED','SENDING');
UPDATE member_topup_member_notifications SET status='FAILED',attempts=5,lease_until=NULL,last_error='payload_snapshot_review_required',updated_at=now()
 WHERE attempts BETWEEN 1 AND 4 AND payload_messages IS NULL AND status IN ('PENDING','RETRY','PROCESSING');
UPDATE member_withdrawal_line_outbox SET status='FAILED',attempts=5,lease_until=NULL,last_error='payload_snapshot_review_required'
 WHERE purpose IN ('MEMBER_TRANSFERRED','MEMBER_REJECTED') AND attempts BETWEEN 1 AND 4 AND payload_messages IS NULL AND status IN ('PENDING','RETRY','PROCESSING');
