# PAIR LIVE V3: temporary slip retention and CSV

## Activation and rollback

1. Confirm the latest remote branch, existing migrations 010–013, LINE webhook configuration, private R2 bucket/prefix, topup audit and `member_wallet_runtime_state.phase='LEGACY'`, `enabled=false`, `ever_cutover=false`. Back up the database before any production schema operation.
2. Apply the forward-only `migrations/014_topup_retention.sql` in a TEST PostgreSQL instance first. Run the PostgreSQL test suite and inspect the synthetic requests and audit. Only after separate production approval, apply the migration to Neon using the repository migration runner. Do not change the wallet cutover values.
3. New slip uploads enroll in `member_topup_slip_retention` with a deadline at request creation plus 24 hours. Existing historical slips have no retention row and are deliberately excluded from automatic R2 deletion; decide their treatment with the accounting and legal owners before any backfill. The image API nevertheless refuses to serve them after 24 hours.
4. Configure `CRON_SECRET` (random secret) and keep `TOPUP_CLEANUP_ENABLED` unset or `false` through deployment and verification. Check Vercel plan: `*/5 * * * *` requires Pro/Enterprise; Hobby permits only daily cron. Choose a scheduler with an interval supported by the actual plan before deployment. After policy approval, enable cleanup and check Vercel runtime logs and the cleanup counts (`claimed`, `purged`, `retried`). Alert if the cron has not succeeded for 10 minutes or overdue unheld rows exist; retry the protected endpoint through an authorized scheduler. A failed R2 delete is retried with backoff; a crashed lease is reclaimed after two minutes. Manual runs require `Authorization: Bearer <CRON_SECRET>`.
5. Legal/dispute holds can be set on the retention row (`legal_hold=true`, `hold_reason`) by an authorized database operator before expiry. Hold rows are excluded from cleanup. Release only after the evidence retention decision is documented. The image endpoint refuses expired links even when the object is held.
6. To pause cleanup, set `TOPUP_CLEANUP_ENABLED=false` without reverting the migration. Do not delete old production slips as a rollback operation.

The 24-hour link deadline is enforced on every request, including previously generated V2 links. Physical R2 deletion depends on a functioning scheduler and R2. Cron is best effort and cannot strictly guarantee deletion at the precise 24-hour boundary; use monitoring and an independent backup scheduler if strict physical deletion is required. R2 must stay private. Old Flex cards cannot be edited; their signed image URL stops working at expiry, and newly dispatched cards show `ภาพสลิปหมดอายุแล้ว` without approval controls if the image has expired. The accounting request and immutable audit remain in Neon.

## APIs

- `GET /api/cron/topup-cleanup`: protected by `CRON_SECRET`, disabled by default.
- `GET /api/admin/topups/csv?period=today|yesterday|range|all&from=YYYY-MM-DD&to=YYYY-MM-DD&status=PENDING|APPROVED|REJECTED&search=...`: server admin session and allowlist, streamed CSV with BOM, Thai clock, escaped spreadsheet formulas; range endpoints use Thailand calendar dates inclusively.
- `GET /api/admin/topups/summary` and existing `/api/admin/topups`: same filters, admin only. UI lists at most 100 rows while summary/export cover the full matching history.

Do not put real member data or real slips into tests. Integration tests use `TOPUP_TEST_DATABASE_URL` on the isolated local PostgreSQL target. Neither this branch nor the migration enables cleanup on production by itself. Existing LINE webhook postback decisions still use `decideTopup()` and the immutable audit. Linked webhook event IDs remain as minimal chat audit references; no raw webhook payload is stored in that table.
