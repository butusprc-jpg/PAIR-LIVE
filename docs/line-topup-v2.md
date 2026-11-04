# PAIR LIVE V2 — LINE topup card

Branch: `feat/pair-live-v1`. Built on verified remote HEAD `7388fd72521f48c59c25161c487330dd09584a94`. This change does not run a production migration, activate wallet cutover, merge, or deploy.

## Member and admin flow

1. A LINE Login member submits the existing topup form with a PNG/JPEG/WebP slip. The application stores it in the private S3-compatible R2 bucket; `member_topup_requests` links its key/hash. The existing notification outbox receives one row per configured administrator when a new request is committed. Existing slips and balances stay in their existing schema.
2. Outbox delivery verifies that R2 can read the stored slip and pushes a mobile Flex card to admin-role LINE users. It includes member name, amount, Bangkok time, request ID, status, a 1024px JPEG image, and two postback actions. An image failure produces a text Flex card with an explicit error and no chat approval actions; the authenticated `/admin` page remains available for investigation.
3. LINE fetches the image from `GET /api/line/topup-image?id=...&exp=...&sig=...`. The HMAC URL expires after 24 hours. The endpoint verifies the token and R2 content/hash/type, converts to JPEG, returns `no-store`, and does not expose the R2 bucket URL or server credentials. Do not share the image URL outside authorized operations; anyone holding a valid unexpired link can fetch that image. The private admin slip endpoint remains authenticated.
4. A tapped action becomes a LINE postback. The webhook verifies `X-Line-Signature` over the original bytes using **Messaging Channel Secret**, then checks the sender's user ID against the current server admin allowlist **with role admin** and a live `admin_identities` row from **LINE Login Channel**. The two channel IDs must be different and the declared LINE provider IDs must match. Verify provider membership in LINE Developers Console when configuring these values; code cannot query that Console.
5. The first tap sends a second confirmation Flex card with the member, points, request ID and `ยืนยันการอนุมัติ`/`ยืนยันการปฏิเสธ` and `ยกเลิก`. The confirmation data is HMAC-signed, bound to the sender ID, and expires after five minutes. A final tap calls the existing `decideTopup()` transaction; its request row lock, immutable audit and unique request ID protect the single LEGACY `members.demo_points` balance against duplicate requests and concurrent administrators. Terminal requests answer `ดำเนินการแล้ว`. The chat answer includes the resulting status and admin identity. Cancellation and denied/invalid actions are logged in an immutable chat action audit.
6. LINE postback event IDs are recorded in the existing webhook table. Per-event row locks deduplicate redelivery; provider push retries use a stable `X-Line-Retry-Key`. If a message fails after the database decision commits, LINE can redeliver and the terminal request is reported without another balance change. The main topup audit is committed in the same transaction as the balance.

## URLs / configuration

| Purpose | URL or setting |
| --- | --- |
| Member request | `/?entry=topup` (existing `?entry=wallet` Rich Menu route also works) |
| Admin history and authenticated slip | `/admin`, `GET /api/admin/topup-slip?id=...` |
| LINE webhook | `POST /api/line/webhook` |
| Signed LINE image | `GET /api/line/topup-image?id=...&exp=...&sig=...` |
| Notification queue retry | `POST /api/admin/topup-line-notifications` (admin auth and mutation CSRF) |
| R2 | Existing server-only `TOPUP_S3_*` variables, private bucket containing `topup-slips/*` |
| LINE Login | Existing `LINE_LOGIN_CHANNEL_ID`, `ADMIN_AUTH_ALLOWLIST_JSON`, LIFF session |
| LINE OA Messaging | `LINE_MESSAGING_CHANNEL_ID`, `LINE_MESSAGING_CHANNEL_SECRET`, `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` |
| Provider check | `LINE_LOGIN_PROVIDER_ID` and `LINE_MESSAGING_PROVIDER_ID` from the LINE Developers Console; both required and equal |
| Image links | New `TOPUP_IMAGE_SIGNING_SECRET`, at least 32 random bytes, server only; retain it until all issued links expire |
| Public base | `NEXT_PUBLIC_APP_BASE_URL`, exact HTTPS origin LINE can reach (no localhost) |

Admin recipients must be friends of the OA and have logged into PAIR LIVE admin auth to have an active identity. Configuring LINE Login IDs in the Messaging fields, or the reverse, prevents delivery/authorization. The system cannot infer provider membership merely from a channel ID. No Messaging access token, channel secret, R2 key or signing secret is returned in API responses or logs.

## Migration and validation

New forward-only migration `migrations/013_line_topup_postbacks.sql` expands the existing webhook event type constraint and adds immutable `member_topup_chat_actions` with event, request, admin, hashed actor, stage and result. Append it after 012 in the manifest. Do not edit or replay 001–012. Local installer rejects non-local production URLs. Review and apply only pending migration to an isolated PostgreSQL 16 or Neon test branch; inspect schema history path/hash, RLS, grants and LEGACY cutover state. After a separately approved production change, apply 013 transactionally with the exact manifest hash and history entry using the migration role, then configure the new server-only settings in the intended Vercel environment. No production change was made here.

The GitHub Actions workflow uses synthetic PostgreSQL, installs all migrations, runs `npm test` and `npm run build`. Unit tests verify signed image URLs, card data, confirmation expiry and actor binding, webhook signature and malformed payload rejection. The PostgreSQL integration test covers two administrators confirming at the same time, a non-admin, repeated webhook event ID, unchanged wallet gate, one balance increase and immutable audit.

A real LINE delivery and button tap require configured provider credentials, public HTTPS deployment, authorized test LINE identities, an OA friendship and a synthetic test request/slip in a test database. They are **NOT TESTED** by mocked HTTP or CI. A provider `200`/`409` means accepted/deduplicated by LINE, not proof the admin saw the card; inspect the authorized test chat and the database to confirm end to end. No pending real-money request may be approved as a test.

## Files changed

- `.env.example`
- `app/api/line/webhook/route.ts`
- `lib/line-preflight.ts`
- `lib/line-webhook-core.ts`
- `lib/migration-manifest.ts`
- `lib/schema-tables.ts`
- `lib/topup/line-notify.ts`
- `lib/topup/store.ts`
- `tests/line-preflight.test.ts`
- `tests/migration-runner.test.ts`
- `tests/topup.test.ts`
- `app/api/line/topup-image/route.ts`
- `docs/line-topup-v2.md`
- `lib/topup/line-card.ts`
- `lib/topup/line-postback.ts`
- `lib/topup/line-provider.ts`
- `migrations/013_line_topup_postbacks.sql`
- `tests/topup-line-card.test.ts`
