# Migration 043 rollback gate

Migration 043 is additive and is not applied to Production in V16 task 3/4.
Before applying it, take a restorable database backup and test the restore on an isolated PostgreSQL instance.

If no settlement has run and both new tables are empty, stop the app version that uses migration 043, then in one maintenance transaction drop `round_settlement_awards`, `round_settlement_config`, the `round_settlement_oa_immutable` trigger and its function, and `rounds.settlement_oa_id`. Remove the migration history entry only as part of that reviewed rollback transaction.

If any award or settled round exists, do not drop these records or roll back the schema. Restore the verified backup to a separate database, reconcile each credited ledger entry and round, and choose a forward repair. The wallet ledger and audit are immutable by design.
