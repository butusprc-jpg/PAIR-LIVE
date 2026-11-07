# Round and report epochs

Migration `022_round_reset_epoch.sql` assigns existing rounds to epoch 1 and adds an epoch to each new round. The reset action appends a new epoch and an audit event. It never deletes rounds, entries, OCR evidence, ledger rows, top-ups, withdrawals, broadcasts, or idempotency keys. Round IDs continue increasing globally.

The admin-only reset endpoint requires an authenticated V5 `admin` role, a one-use mutation challenge, a unique request key, and the exact phrase `ยืนยันเริ่มใหม่`. A PostgreSQL transaction takes the round-engine advisory lock and locks both broadcast outboxes before it checks for an open/closing round or an in-flight delivery. A repeated request key returns the original result; a reset of an empty epoch is a no-op.

Normal round, entry, evidence, participation, daily report, countdown, and broadcast queries use the current epoch. Older entries remain in their original state, including `PENDING`. Database triggers reject changes to archived rounds and entries so later code cannot settle or debit an archived entry by accident. The admin evidence endpoint can still retrieve archived evidence by round ID for audit.

For an audit, query `round_reset_epochs` and join `rounds.epoch_id` to the requested epoch. Restoring an archived epoch to normal operation is deliberately unavailable in the UI or API; it requires a separately reviewed database procedure that first reconciles pending entries, in-flight notifications, and the unique unfinished-round constraint. Do not change the current epoch by editing IDs or deleting the latest epoch row.

Before any production rollout, apply migration 022 with the database migration role, verify the runtime role can read and insert `round_reset_epochs`, and validate the worker and notification processes against the migrated schema. These production checks were not performed in this local task.
