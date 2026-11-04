-- NULL is deliberately not used as a new-row default: all requests created
-- before or during rollout used the old pre-debit implementation.
ALTER TABLE member_withdrawal_requests
 ADD COLUMN debit_timing text DEFAULT 'PREDEBIT' NOT NULL
 CHECK (debit_timing IN ('PREDEBIT','ON_APPROVAL'));
ALTER TABLE member_withdrawal_requests ALTER COLUMN debit_timing DROP DEFAULT;
CREATE OR REPLACE FUNCTION withdrawal_terminal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.status<>'PENDING' OR NEW.id<>OLD.id OR
    NEW.member_id<>OLD.member_id OR NEW.requested_points<>OLD.requested_points OR
    NEW.payout_details<>OLD.payout_details OR NEW.idempotency_key<>OLD.idempotency_key OR
    NEW.debit_timing<>OLD.debit_timing OR NEW.created_at<>OLD.created_at
 THEN RAISE EXCEPTION 'withdrawal_immutable'; END IF;
 RETURN NEW;
END$$;
