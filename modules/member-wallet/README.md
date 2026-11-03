# PAIR LIVE member wallet (demo points)

This module holds **demo points with no monetary value**. Points cannot be exchanged for cash or goods. It has no payment, slip approval, payout, or withdrawal API. No Core route or UI is installed by this branch.

## Source of truth and rollout gate

The current Round Engine debits `members.demo_points` inside its own transaction. The new wallet ledger must not debit points at the same time. The module's `migrationComplete` configuration and a database runtime gate are deliberate activation checks: keep both disabled until Core is changed in a separately reviewed integration so wallet balance replaces the old `members.demo_points` debit and the round entry plus wallet ledger update commit together. `useDemoPoints` must not be used as a separate preflight debit. A read-only preflight can become stale; the final debit and entry insert need one database transaction and row locks.

For migration, freeze new demo entries briefly, reconcile each member's legacy balance and entry history, create one wallet per internal member ID with an audited opening adjustment, verify aggregate and per-member totals, switch Core to the new transaction adapter, then reopen entries. Make the cutover idempotent and keep an operator rollback plan. Do not silently seed from profile names or provider identities. The existing `members.demo_points` default of 1250 and historical deductions must be accounted for. A returning LINE or WeChat user with the **same verified internal member ID** sees the same wallet; matching display names or avatars never links accounts.

## Public API and trust boundaries

`createMemberWalletModule(config)` receives a transaction-safe `WalletStore`, a `MemberIdentityAdapter` that reads the verified member session, and an `AdminAuthorizationAdapter` that checks a server-side admin session. Its methods provide `getWallet`, `getWalletHistory`, `ensureWallet`, `grantDemoPoints`, `useDemoPoints`, `refundDemoPoints`, and `getWalletLedger`. Result objects are typed as `{ok:true,value}` or `{ok:false,error}`. See `types.ts` for the precise contract. Server code runs on Node; client imports come from `client/` and receive sanitized props only.

Member-facing calls must derive the member ID from `currentMember()` on the server. Do not accept `memberId` from a browser body or URL for authorization. Admin grants/adjustments require a verified Admin Auth guard; an internal test harness is disabled in production. No member can grant or withdraw points through a public route.

Every mutation has an idempotency key, reference ID, actor and audit source. The PostgreSQL adapter takes a wallet row lock, checks the idempotency key, updates the balance and inserts an append-only ledger entry in one transaction. A repeated key with different type/member/reference/points is a conflict. Grants, uses and refunds use positive points; an audited adjustment may be positive or negative but may never make the balance negative. Balances are integer and nonnegative; a frozen wallet cannot be mutated. `reservedPoints` exists for future controlled reservations; no client can modify it. The migration applies RLS to wallet and ledger reads and restricts public table privileges. The adapter receives a private pool, never credentials from the browser.

## Database and configuration

Apply `migrations/001_member_wallet.sql` explicitly to the PAIR LIVE PostgreSQL database after Core member migration. It creates `member_wallets`, `member_wallet_ledger` and `member_wallet_audit_logs`, with one wallet per `members.id`, keys, indexes, checks and owner RLS. It does not change `members` or `round_entries`. Use a trusted TLS connection and private roles with the minimum necessary access. For administrator writes, the host must provide an approved private role or a controlled database function; never expose raw pool access to the client.

Suggested server-only configuration names are `DATABASE_URL` and `MEMBER_WALLET_MIGRATION_COMPLETE`. The latter must remain false until the verified cutover. No external provider credential is needed by the module; LINE/WeChat authentication remains in the existing member system. No real PostgreSQL connection was available during this task; database migration and live integration are **NOT TESTED**. Fake store and SQL-contract tests establish module behavior only.

## Development checks

From `/workspace/PAIR-LIVE`:

```sh
npm ci --no-audit --no-fund
npm test
npx tsx --test modules/member-wallet/tests/*.test.ts
npm run build
```

The root `npm test` script covers Core tests only, so run the separate module command too. UI screenshots are display fixtures, not evidence of a connected wallet or authorized grant. See [integration contract](examples/nextjs-integration.md) and [delivery evidence](DELIVERY.md).
