-- Existing immutable audit rows retain NULL snapshots. New decisions populate them.
ALTER TABLE member_withdrawal_audit
 ADD COLUMN balance_before integer CHECK (balance_before >= 0),
 ADD COLUMN balance_after integer CHECK (balance_after >= 0),
 ADD COLUMN points_changed integer,
 ADD CONSTRAINT withdrawal_audit_balance_change CHECK (
  balance_before IS NULL AND balance_after IS NULL AND points_changed IS NULL
  OR balance_before IS NOT NULL AND balance_after IS NOT NULL AND points_changed IS NOT NULL
   AND balance_after::bigint=balance_before::bigint+points_changed::bigint
 );
