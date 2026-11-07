-- A dedicated, non-login counter can see entry rows through forced RLS.
-- The separate reset executor can call only the aggregate function, never read entries.
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='pair_round_reset_counter') THEN
  CREATE ROLE pair_round_reset_counter NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='pair_round_reset_executor') THEN
  CREATE ROLE pair_round_reset_executor NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('pair_round_reset_counter','pair_round_reset_executor')
  AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreaterole)) THEN
  RAISE EXCEPTION 'round_reset_role_not_restricted';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
  WHERE r.rolname='pair_round_reset_counter') THEN
  RAISE EXCEPTION 'round_reset_counter_role_has_members';
 END IF;
END $$;

DO $$
BEGIN
 EXECUTE format('GRANT USAGE,CREATE ON SCHEMA %I TO pair_round_reset_counter',current_schema());
 EXECUTE format('GRANT USAGE ON SCHEMA %I TO pair_round_reset_executor',current_schema());
END $$;
GRANT SELECT ON round_reset_epochs,rounds,round_entries,round_ocr_evidence TO pair_round_reset_counter;
CREATE POLICY round_entries_reset_counter ON round_entries FOR SELECT TO pair_round_reset_counter USING (true);

CREATE FUNCTION round_reset_counts(target_epoch bigint DEFAULT NULL)
RETURNS TABLE(epoch_id bigint,rounds bigint,entries bigint,pending_entries bigint,ocr_evidence bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE selected_epoch bigint;
BEGIN
 IF NOT pg_catalog.pg_has_role(session_user,'pair_round_reset_executor','MEMBER') THEN
  RAISE EXCEPTION 'round_reset_counter_denied' USING ERRCODE='42501';
 END IF;
 selected_epoch:=current_round_epoch_id();
 IF selected_epoch IS NULL OR (target_epoch IS NOT NULL AND target_epoch<>selected_epoch) THEN
  RAISE EXCEPTION 'round_epoch_unavailable';
 END IF;
 RETURN QUERY SELECT selected_epoch,
  (SELECT count(*) FROM rounds r WHERE r.epoch_id=selected_epoch),
  (SELECT count(*) FROM round_entries e JOIN rounds r ON r.id=e.round_id WHERE r.epoch_id=selected_epoch),
  (SELECT count(*) FROM round_entries e JOIN rounds r ON r.id=e.round_id WHERE r.epoch_id=selected_epoch AND e.status='PENDING'),
  (SELECT count(*) FROM round_ocr_evidence o JOIN rounds r ON r.id=o.round_id WHERE r.epoch_id=selected_epoch);
END $$;
DO $$
BEGIN
 EXECUTE format('ALTER FUNCTION %I.round_reset_counts(bigint) SET search_path = pg_catalog,%I',current_schema(),current_schema());
END $$;
ALTER FUNCTION round_reset_counts(bigint) OWNER TO pair_round_reset_counter;
REVOKE ALL ON FUNCTION round_reset_counts(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION round_reset_counts(bigint) TO pair_round_reset_executor;
DO $$
BEGIN
 EXECUTE format('REVOKE CREATE ON SCHEMA %I FROM pair_round_reset_counter',current_schema());
END $$;

-- The executor cannot read raw entry or OCR rows and cannot update old epochs.
GRANT SELECT,INSERT ON round_reset_epochs TO pair_round_reset_executor;
GRANT USAGE ON SEQUENCE round_reset_epochs_id_seq TO pair_round_reset_executor;
GRANT SELECT ON rounds,round_line_broadcast_outbox,round_countdown_line_outbox,
 report_notification_outbox,report_notification_events TO pair_round_reset_executor;
GRANT UPDATE ON round_line_broadcast_outbox,round_countdown_line_outbox,
 report_notification_outbox TO pair_round_reset_executor;
GRANT INSERT ON round_audit_logs TO pair_round_reset_executor;
GRANT USAGE ON SEQUENCE round_audit_logs_id_seq TO pair_round_reset_executor;
