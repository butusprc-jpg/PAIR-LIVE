-- Apply after Core 005 and modules/member-wallet/migrations/001_member_wallet.sql.
-- This migration leaves the runtime in LEGACY. It does not cut over balances.
ALTER TABLE member_wallet_runtime_state
 ADD COLUMN phase text NOT NULL DEFAULT 'LEGACY'
 CHECK (phase IN ('LEGACY','CUTOVER_PENDING','WALLET_ACTIVE','WALLET_SUSPENDED')),
 ADD COLUMN ever_cutover boolean NOT NULL DEFAULT false,
 ADD CONSTRAINT wallet_phase_consistent CHECK (
  (phase='LEGACY' AND enabled=false AND ever_cutover=false)
  OR (phase='CUTOVER_PENDING' AND enabled=false AND ever_cutover=false)
  OR (phase='WALLET_ACTIVE' AND enabled=true AND ever_cutover=true AND cutover_at IS NOT NULL)
  OR (phase='WALLET_SUSPENDED' AND enabled=false AND ever_cutover=true AND cutover_at IS NOT NULL));
CREATE FUNCTION wallet_phase_forward_only() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
 IF OLD.ever_cutover AND NOT NEW.ever_cutover THEN RAISE EXCEPTION 'wallet_cutover_cannot_reset'; END IF;
 IF OLD.phase='LEGACY' AND NEW.phase NOT IN ('LEGACY','CUTOVER_PENDING') THEN RAISE EXCEPTION 'wallet_cutover_requires_pending'; END IF;
 IF OLD.phase='CUTOVER_PENDING' AND NEW.phase NOT IN ('CUTOVER_PENDING','WALLET_ACTIVE') THEN RAISE EXCEPTION 'wallet_cutover_cannot_rollback'; END IF;
 IF OLD.phase='WALLET_ACTIVE' AND NEW.phase NOT IN ('WALLET_ACTIVE','WALLET_SUSPENDED') THEN RAISE EXCEPTION 'wallet_cutover_cannot_rollback'; END IF;
 IF OLD.phase='WALLET_SUSPENDED' AND NEW.phase NOT IN ('WALLET_SUSPENDED','WALLET_ACTIVE') THEN RAISE EXCEPTION 'wallet_cutover_cannot_rollback'; END IF;
 RETURN NEW;
END$$;
CREATE TRIGGER wallet_phase_transition BEFORE UPDATE ON member_wallet_runtime_state FOR EACH ROW EXECUTE FUNCTION wallet_phase_forward_only();
CREATE OR REPLACE FUNCTION forbid_legacy_demo_debit_after_wallet_cutover() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
 IF NEW.demo_points IS DISTINCT FROM OLD.demo_points AND EXISTS(SELECT 1 FROM member_wallet_runtime_state WHERE id=1 AND phase<>'LEGACY')
 THEN RAISE EXCEPTION 'legacy_demo_points_locked_after_wallet_cutover'; END IF;
 RETURN NEW;
END$$;
-- The existing members_legacy_demo_points_guard trigger from 005 invokes this replaced function.
