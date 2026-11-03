# Member Wallet delivery evidence

Branch: `feat/pair-live-member-wallet`; base `3963737c8f0ea392ce0fb3847f6f971fd9de3ab9`. The full delivered SHA is in the handoff and `git rev-parse HEAD`.

## Validation

| Check | Outcome |
| --- | --- |
| Wallet module tests (`npx tsx --test modules/member-wallet/tests/*.test.ts`) | 13 PASS, 0 fail/skip: fake service 7, PostgreSQL SQL contract 6 |
| Existing Core `npm test` | 10 PASS, 1 SKIP because no DATABASE_URL |
| Whole-repo TypeScript check | PASS |
| `npm run build` | PASS, production compile, type check and static pages |
| Wallet mobile and history mobile | Chromium fixture checked headings, action explanations, rows, no horizontal overflow or JS page errors |
| Real PostgreSQL migration and integration | NOT TESTED, no database configured |
| Core Round Engine debit plus wallet ledger atomicity | NOT TESTED; future Core adapter and reconciled cutover required |
| Production payment, slip, cash withdrawal or reward flow | Not implemented and not in scope |

The old Round Engine uses `members.demo_points`. The service config and migration's independent database gate block wallet mutation until a reviewed cutover. A round deduction is available only through an injected `RoundUseAdapter.commit` that must share one database transaction with the Core entry insert. Fake tests demonstrate balance/idempotency behavior but cannot prove that future Core integration. The database gate starts disabled. No account merging is inferred from a LINE/WeChat profile.

## Public API and schema

`createMemberWalletModule(config)` exposes `ensureWallet`, `getWallet`, `getWalletHistory`, `getWalletLedger`, `grantDemoPoints`, `useDemoPoints`, `refundDemoPoints`, `adjustDemoPoints`. Context comes first and is verified through the injected member or admin adapter; IDs from a client body are not authorization. The PostgreSQL adapter `createPostgresWalletStore` is exported. See README and types.ts.

`migrations/001_member_wallet.sql` adds the disabled runtime gate, `member_wallets`, append-only `member_wallet_ledger`, and `member_wallet_audit_logs` with one wallet per internal member ID, foreign keys, indexes, checks and owner RLS. Signed corrections use `DEMO_ADJUSTMENT` and cannot make balances negative. Migration does not alter members or round tables.

Suggested server-only names: `DATABASE_URL` and `MEMBER_WALLET_MIGRATION_COMPLETE` (must remain false until cutover). No new LINE/WeChat credential is read by this module. Existing member session and future Admin Auth are injected, not reimplemented.

See `examples/nextjs-integration.md` for Member Session, Admin Auth, balance reconciliation, the single-transaction Round Engine cutover and UI install. Potential camera merge collision points are `app/page.tsx`, `app/globals.css`, and `lib/rounds/store.ts`; none are touched here. No merge, force push or deployment occurred.

## Complete module file list

All paths below are relative to `modules/member-wallet/`:

- `DELIVERY.md`
- `README.md`
- `client/MemberWallet.tsx`
- `client/WalletHistory.tsx`
- `client/index.ts`
- `client/styles.module.css`
- `client/view-types.ts`
- `examples/member-wallet-mobile.png`
- `examples/nextjs-integration.md`
- `examples/preview.tsx`
- `examples/wallet-history-mobile.png`
- `index.ts`
- `migrations/001_member_wallet.sql`
- `server/adapters.ts`
- `server/ledger.ts`
- `server/postgres.ts`
- `server/validation.ts`
- `server/wallet-service.ts`
- `server/wallet-store.ts`
- `tests/postgres.test.ts`
- `tests/wallet-service.test.ts`
- `types.ts`
