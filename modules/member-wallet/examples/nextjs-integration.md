# Future PAIR LIVE Wallet integration contract

This branch does not install routes or change Core. It prepares a wallet and ledger that can replace the old demo balance after a separately reviewed cutover.

## 1. Install and reconcile

Apply `modules/member-wallet/migrations/001_member_wallet.sql` to the PAIR LIVE PostgreSQL database with a migration role after `migrations/001_members.sql` and `002_round_engine.sql`. The new runtime gate defaults disabled. Do not enable it during migration or start-up. The existing member sessions and identities remain the source of member ID; do not create wallets from display names or provider profile fields.

Before live activation, stop new demo entries at an agreed maintenance point and snapshot `members.id, demo_points` and round-entry history. Check that each wallet ID is unique by member ID. Backfill one wallet per existing internal member ID with an auditable opening `DEMO_ADJUSTMENT` or approved migration record. Compare each wallet balance with its frozen `members.demo_points` value, including zero balances and accounts with both verified LINE and WeChat identities. Count rows and compare aggregate totals. Investigate every mismatch; do not overwrite either balance silently. The Core default 1250 and historical deductions are part of this reconciliation.

After Core is adapted and integration tests pass, activate the service and DB gates in the same controlled release. Keep the old balance read-only or remove its display path so users cannot see contradictory totals. Store a reconciliation record and rollback procedure. If a rollback is needed after new wallet entries exist, reconcile those entries before returning to legacy debit logic; a flag flip alone is unsafe.

## 2. Member and admin identity

Build `createMemberWalletModule` in a private Node service factory with injected PostgreSQL store, member identity adapter and admin authorization adapter. A member route calls the existing `currentMember()` from `lib/server/auth-http.ts`; its verified `id` is passed through the adapter. Never accept `memberId` from request JSON or query parameters. The same internal ID already belongs to a verified LINE/WeChat identity through `member_identities`. Linking providers is a separate verified identity operation in Core, not a wallet operation.

When the separate Admin Auth branch is integrated, adapt its `requireAdmin(request, ['admin'])` and one-use `requireAdminMutation(request, ['admin'])` for grants or adjustments. Those return typed results and may require the host to obtain a mutation challenge first. The current admin Core route denies access; no production admin grant route should be exposed until Admin Auth is installed. An internal test harness must be disabled in production.

Member GET routes can return sanitized wallet and ledger records to the session owner only, with `Cache-Control: no-store`. Do not add member POST routes for grant, withdraw, payment or slip approval. Admin writes use bounded integer points, stable reference IDs and idempotency keys; do not trust a browser role. Keep `DATABASE_URL` and any admin/session credentials out of client bundles.

## 3. Round Engine cutover

`lib/rounds/store.ts` currently calls `UPDATE members SET demo_points=demo_points-$1 ...` in `submitDemoEntry`. Replace that one statement in a separately reviewed Core change, not in this branch. The future round transaction must lock the round and wallet, check idempotency, make one ledger `DEMO_USE` entry and one `round_entries` insert, and commit them together. Use the same DB transaction/connection for both operations. A wallet preflight GET is informative only; it cannot guarantee funds at commit time. Do not call the standalone `useDemoPoints` and then call the old `submitDemoEntry`, because that would debit twice.

If the round insert fails, roll back the wallet mutation. If a round request is retried with the same idempotency key, return the existing entry without a second debit. A cancellation should refund only the exact original used amount with a unique refund reference in one controlled transaction. No result settlement, cash payout, or OCR behavior belongs to this wallet module. Keep round state and camera operation in Core.

## 4. UI installation

Import `MemberWallet` and `WalletHistory` from `modules/member-wallet/client` into a future member page or LIVE account panel. Feed them only the current member's sanitized profile/wallet/ledger view; keep loading/empty/error states. The existing header displays `members.demo_points`, so update it only during the cutover to the wallet-derived balance. The two example buttons are explanatory UI only: “เติมแต้ม” says real slip acceptance is unavailable; “ถอนแต้ม” opens a contact form for demo-points questions, not a cash or reward request. Neither button calls a payment or wallet mutation API.

Potential merge collisions with the camera branch are `app/page.tsx`, `app/globals.css`, and `lib/rounds/store.ts`. A future private service factory may be added in `lib/server/`, but this module changes none of those paths. Coordinate route/page changes with the camera owner; do not merge, rebase or deploy as part of this branch.

## 5. Validation boundary

Module unit and fake-store integration tests can verify identity scoping, duplicate prevention, concurrent deductions, frozen wallets and ledger math. PostgreSQL SQL contract tests do not prove the migration runs against a real database. Before activation, run the migration and rollback drill on a staging PAIR LIVE database, test owner RLS and admin privileges, compare legacy balances, and verify round entry plus wallet debit atomicity with two concurrent sessions. This live database and Core cutover work is **NOT TESTED** in this branch.
