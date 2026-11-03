-- Apply after Core migrations 001-004 and modules/member-wallet/migrations/001_member_wallet.sql.
-- Wallet gate remains disabled until a separately reviewed reconciliation/cutover.
CREATE FUNCTION forbid_legacy_demo_debit_after_wallet_cutover() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.demo_points IS DISTINCT FROM OLD.demo_points
 AND EXISTS(SELECT 1 FROM member_wallet_runtime_state WHERE id=1 AND enabled=true)
 THEN RAISE EXCEPTION 'legacy_demo_points_locked_after_wallet_cutover'; END IF;
 RETURN NEW;
END$$;
CREATE TRIGGER members_legacy_demo_points_guard BEFORE UPDATE OF demo_points ON members
FOR EACH ROW EXECUTE FUNCTION forbid_legacy_demo_debit_after_wallet_cutover();
CREATE FUNCTION member_wallet_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'wallet audit is append-only'; END$$;
CREATE TRIGGER member_wallet_audit_no_update_delete BEFORE UPDATE OR DELETE ON member_wallet_audit_logs
FOR EACH ROW EXECUTE FUNCTION member_wallet_audit_immutable();
REVOKE ALL ON member_wallet_runtime_state,member_wallets,member_wallet_ledger,member_wallet_audit_logs FROM PUBLIC;
