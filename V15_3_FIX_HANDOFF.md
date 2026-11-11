# PAIR LIVE V15.3 — Topup and Withdrawal

Branch: `feat/pair-live-v14-9-single-oa-railway` · Draft PR #16. Base remote HEAD checked before editing: `d65c9691e6deeb86a4fb37b0263167dd5f3d8a2a`.

## Findings

- The Railway staging diagnostic `/api/health/line-webhook` returned `MISMATCH` with `webhookActive: true` on 2026-11-11. The active LINE OA endpoint does not match the staging webhook. A request stored in staging cannot be found by a postback delivered to another environment. Recent staging HTTP logs showed a successful topup POST but no webhook POST in the inspected window. This is evidence of an environment mismatch, not proof of the destination database's identity. No production webhook or database was changed.
- `decideTopup` and both withdrawal functions rejected an active Wallet runtime with `legacy_required`. The legacy `demo_points` path remains intact; the new branch uses the existing atomic Wallet mutation and ledger for active Wallet only. A PREDEBIT refund credits the active wallet only after the existing request row is locked and its debit timing is verified. Wallet cutover requires an already reconciled snapshot of held legacy points.
- Topup's repeated LINE event read the latest request without the required admin RLS context. The row could appear absent after approval. Reads now use the scoped admin transaction.
- Historical commits: `ac6ec8c` introduced one-tap approval; `3a02d79` briefly restored two-step; `65e67e6` restored one action; `dd574d7` made withdrawal postback atomic; `2e2d26c` corrected the withdrawal card to use the request ID. Recent `f6d8873` and `d65c969` only added and scoped the staging diagnostic; they did not change topup or withdrawal accounting.

## Changed surfaces

- `lib/topup/store.ts`, `lib/withdrawal/store.ts`: active Wallet branch with request-row lock, existing ledger idempotency key, audit and status in the same transaction. Legacy behavior preserved.
- `lib/topup/line-postback.ts`: latest status under admin RLS, including old-card and repeated-event replies.
- `lib/server/wallet-cutover.ts`, member topup/withdrawal GET routes: show the balance of the active runtime path.
- `lib/topup/webhook-binding.ts`, member POST routes: staging-only LINE endpoint preflight fails before inserting requests when postback would go to another environment. It does not change the LINE OA endpoint. The read-only staging diagnostic remains for verification.
- `tests/topup-withdrawal-wallet-db.test.ts`, `tests/topup-webhook-binding.test.ts`, `tests/topup.test.ts`: synthetic Wallet/Legacy, replay, rollback and webhook-binding coverage. The topup decision checksum in `tests/topup-ledger-lock.test.ts` has a new exact baseline for the expressly requested Wallet cutover branch; the check is still enforced.

No migration, wallet schema, round, LIVE or V15.2 source was changed. No real request or member balance was used for testing.

## Verification and release boundary

Local `npm test`: 127 PASS, 0 FAIL, 22 SKIP (PostgreSQL is unavailable in the workspace). `npx tsc --noEmit` and `npm run build` PASS. The PostgreSQL Wallet regression test is written but remains SKIP locally. GitHub Actions PostgreSQL 16 results must be checked after uploading the patch; a local unit run is not a substitute for the CI database test.

Local commit `9b0d433` contains the fix. A single `git push` attempt failed with `could not read Username for 'https://github.com': No such device or address`. Remote branch and Draft PR #16 were not updated; GitHub Actions was not rerun. Import `V15_3_FIX.patch` onto remote HEAD `d65c9691e6deeb86a4fb37b0263167dd5f3d8a2a`, then run the existing PostgreSQL 16 Actions workflow and fix any failures before deploying. The patch must be compared with remote HEAD again before import to preserve later changes.

Staging cannot accept safe topup/withdrawal requests while its LINE OA webhook reports `MISMATCH`. The owner must separately decide how to route a test OA or staging webhook before an end-to-end LINE staging trial. This change deliberately does not alter the production OA webhook. No Railway staging or Production deploy, PR merge, or production database mutation is part of this delivery.
