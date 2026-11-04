# PAIR LIVE V1.2 manual topups

Implementation base: `43b87d9534c9ff41d06eee8ea58656fb76899288` on `feat/pair-live-v1` (remote fetched before changes and again before commit). No production database, cutover, merge or deployment commands were used.

## URLs and API

| Purpose | Path |
| --- | --- |
| Existing rich menu | `https://liff.line.me/2012365283-j7QSoLC2?entry=wallet` |
| Member topup | `/?entry=topup` (existing `/?entry=wallet` now enters topup too) |
| Existing wallet | member navigation: คะแนน |
| Admin approvals / QR | `/admin`, admin role only |
| Member list + configuration | `GET /api/member/topups` |
| Member submit | `POST /api/member/topups` with `{points,idempotencyKey}` |
| Member image / download | `GET /api/member/topup-qr[?download=1]` |
| Admin search | `GET /api/admin/topups?search=...&status=PENDING` |
| Admin decision | `POST /api/admin/topups` with `{id,action:"APPROVED" or "REJECTED",note}` |
| Admin QR read / upload | `GET/POST /api/admin/topup-qr`, upload body is raw image bytes |

Member identity and display name come from the existing HttpOnly member session; body-supplied member IDs are ignored. Admin endpoints use the existing server session + current allowlist and admin role. Mutations consume a fresh `X-Admin-CSRF` token from `/api/admin/auth/challenge`. Denied admin access returns 403. Member submit also requires same-origin. QR reads require authentication and never expose the S3 object URL. Responses are no-store; images are nosniff.

## Balance and duplicate protection

The current member session and LEGACY UI read `members.demo_points`. Approval updates only that column, never `member_wallets.available_points`. `walletPathFromDatabase` must report LEGACY, and holds the runtime row shared lock until commit. No cutover flag is changed.

One transaction locks the request `FOR UPDATE`, checks admin identity status, checks pending status, validates configured point cap, locks/checks active member, updates the single legacy balance, inserts immutable audit and records terminal status/admin/time. Errors rollback all changes. Already approved retries return the stored approved result without a balance update; opposite terminal transitions return 409. Audit has a unique request FK, and a trigger rejects terminal request edits/deletes. Member creation uses `(member_id,idempotency_key)` uniqueness, checks replayed amount and persists the key in sessionStorage until success. UI uses a synchronous lock as well as disabled buttons. After a timeout it reads server state; admin retry stays blocked if that read fails. Database locking/constraints remain authoritative across tabs/processes.

Audit stores before/after balance, points, request/member/admin IDs, action, note and timestamp. Audit and QR version rows reject update/delete. The private application database role must not be exposed to clients; database owners/superusers remain trusted operators. New request/audit tables use forced RLS, with transaction-local member/admin scope and explicit owner filtering. QR tables revoke PUBLIC access; only authenticated server APIs access them.

QR uploads: 2 MiB maximum streamed input, PNG/JPEG/WebP magic detection plus full Sharp decoding and bounded dimensions (4096×4096, 16M pixels), private S3-compatible object storage with immutable random keys. Database keeps only metadata/key/hash. Saving a version and switching the current pointer are atomic. Concurrent replacements serialize the current pointer; the last committed pointer is current. An upload followed by DB failure can leave an unreferenced private object; configure lifecycle cleanup for such objects. Source metadata/bytes are retained; they are not base64 database blobs.

## Configuration

Preserve existing LINE login/channel, LIFF, member sessions, Neon DATABASE_URL and ADMIN_AUTH_ALLOWLIST_JSON settings. Keep `PAIR_WALLET_CUTOVER_VERIFIED` unset/false.

- `TOPUP_MAX_POINTS`: positive integer, default 100000, maximum 2147483647. Same cap enforced during creation and approval; lowering it can require rejecting an older over-cap request.
- `TOPUP_S3_ENDPOINT`: HTTPS private S3-compatible endpoint
- `TOPUP_S3_REGION`, `TOPUP_S3_BUCKET`
- `TOPUP_S3_ACCESS_KEY_ID`, `TOPUP_S3_SECRET_ACCESS_KEY`: server-only credentials with object Get/Put on `topup-qr/*`; no public bucket/object access. Use a dedicated private bucket/prefix. Never use NEXT_PUBLIC variables for credentials.

## Migration / installation runbook (not executed on production)

New forward-only migration: `migrations/010_manual_topups.sql`, appended after all existing module migrations and 009. Existing migration files are unchanged. Adds member_topup_requests, member_topup_audit, member_topup_qr_versions and member_topup_qr_current plus constraints/indexes/triggers/policies. Metadata table allowlist is extended.

1. Review the diff and CI results; create an isolated Neon TEST branch or local PostgreSQL 16 database using synthetic data only. Verify existing migration hashes match the manifest. Back up production before any later approved production work.
2. Local test database must be named `pair_live_migration_test` on localhost/127.0.0.1. Set `MIGRATION_TEST_DATABASE_URL` and run `node --import tsx scripts/migrate.ts --dry-run`, `--apply`, then `--validate`. The existing migration runner deliberately rejects Neon/production URLs; do not relax this guard.
3. Set `TOPUP_TEST_DATABASE_URL` to the same isolated local DB and run `npm test`. Optional `WALLET_TEST_DATABASE_URL` runs existing wallet regression integration tests. The GitHub Actions workflow provisions a disposable postgres:16 service and uses these settings; it receives no production secrets.
4. For a Neon TEST branch, use a reviewed migration tool or SQL console to apply only pending manifest entries in order, each transactionally, preserving schema_migration_history path/SHA256 records. Do not replay installed migration files. Use migration-owner privileges; grant the existing private application role only required SELECT/INSERT/UPDATE (no DELETE/TRUNCATE on request/audit/version tables). Ensure application-role RLS checks pass before rollout.
5. After explicit production approval only, repeat the reviewed migration process for pending 010 on production using its exact manifest SHA256 and transactional schema_migration_history insertion. Verify LEGACY/enabled=false/ever_cutover=false before and after. No balance backfill and no wallet cutover are needed. Rollback is application rollback, never dropping financial history or editing installed migrations.
6. Configure the private object store and server environment in the intended Vercel test environment, retaining LINE/LIFF IDs and existing auth configuration. Run `npm ci`, `npm test`, `npm run build`. After separate approval, deploy through the existing project process. This change does not invoke Vercel deployment or alter production settings.
7. Use synthetic LINE/test accounts to verify login, QR upload/download/change, repeated submit, approve/reject, suspended member, multiple admin sessions/tabs, interrupted network and member balance refresh. Then check audit and cutover state. Real member/slip data must not be used as fixtures.

## Validation status

Local: `npm test` passed 67, failed 0, skipped 4 database-dependent tests; `npm run build` passed. The test command uses `node --import tsx --test` to avoid tsx CLI IPC socket issues while preserving the same test files. Local HTTP checks passed: GET/POST admin topups and QR returned 403 without authentication (4 checks); GET member topups and QR returned 401 without a session (2 checks); cross-origin member submit returned 403 (1 check). Member QR/status/balance refresh every 30 seconds and on focus, using no-store image URLs.

Local PostgreSQL integration/concurrency: BLOCKED. This managed executor has only uid 0 mapped; PostgreSQL requires a non-root process, and changing users/user namespace is unavailable. No production fallback was attempted. Integration coverage is committed and CI provisions isolated PostgreSQL 16. Do not treat skipped tests as passes. CI run 41780686612 passed the new PostgreSQL topup integration test, schema/migration integration and existing wallet integration. The full suite initially failed because the runner lacked ImageMagick for existing OCR tests; the workflow now installs ImageMagick and Tesseract. Final full CI results are linked in the delivery report. The topup test submitted one key 8 times (one request), approved it concurrently 12 times across two admin IDs (balance 100 → 150 once, one audit, no new-wallet write), replayed the result, rejected terminal reversals, injected audit failure (balance and PENDING status rolled back), rejected suspended members/invalid points/unknown admin, tested other-member isolation, RLS under a non-owner role, immutable audit/terminal status and unchanged LEGACY gates.

NOT TESTED live: LINE login/LIFF roundtrip, private S3 credentials/ACL and real upload/download, two real administrator browsers, refresh/network interruption in real browsers, Neon test deployment, production. No test used actual member identities or slips.

## Changed files

- `app/admin/page.tsx`
- `app/page.tsx`
- `lib/member-entry.ts`
- `lib/migration-manifest.ts`
- `lib/schema-tables.ts`
- `package-lock.json`
- `package.json`
- `tests/member-entry.test.ts`
- `tests/migration-runner.test.ts`
- `.github/workflows/manual-topup-tests.yml`
- `app/api/admin/topup-qr/route.ts`
- `app/api/admin/topups/route.ts`
- `app/api/member/topup-qr/route.ts`
- `app/api/member/topups/route.ts`
- `components/Topup.tsx`
- `docs/manual-topups-v1.2.md`
- `lib/topup/http.ts`
- `lib/topup/qr.ts`
- `lib/topup/store.ts`
- `migrations/010_manual_topups.sql`
- `tests/topup.test.ts`
