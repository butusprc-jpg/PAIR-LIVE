# PAIR LIVE report and notification delivery

Branch: `feat/pair-live-report-module`, based on `3963737c8f0ea392ce0fb3847f6f971fd9de3ab9`. The full commit SHA is reported in the handoff message and available via `git rev-parse HEAD`.

## Verified results

| Check | Result |
| --- | --- |
| Module tests (`npx tsx --test modules/report-notification/tests/*.test.ts`) | 24 PASS, 0 fail/skip: reports 6, PostgreSQL SQL contracts 7, notification fake adapters/queue 10, composed factory 1 |
| Existing Core `npm test` | 10 PASS, 1 PostgreSQL integration SKIP (no `DATABASE_URL`) |
| `npm run build` | PASS, Next production compile, type check and static pages |
| `npx tsc --noEmit --incremental false` | PASS |
| Mobile Dashboard, desktop Dashboard, mobile Notification Settings | Chromium screenshots, titles and layout checked, no horizontal overflow or page errors |
| Fake LINE | Official Messaging API push URL, retry key, accepted/error/not-configured states checked; no real send |
| Fake Email | Thai subject, plain/HTML content and accepted/not-configured states checked; no real send |
| Fake WeChat | Explicit eligibility, not-supported and API-error handling checked; no real send |
| Real LINE / email / WeChat | NOT TESTED; no credentials, provider permissions or authorized recipients |
| Real PostgreSQL migration / integration | NOT TESTED; no database connection; aggregate reader needs approved cross-member RLS access |
| Core files / other branches | No changes, no merge, force push or deploy |

Provider `SENT` means provider API accepted the request. A human read/receipt was not observed. Outbox leases and uniqueness prevent simultaneous work and duplicate enqueuing; a crash after API acceptance and before DB completion can still cause a repeated transmission unless the provider honors the idempotency key. Do not call this exactly-once delivery.

## Public API and schema

The composed API exports `getRoundReport`, `getDailyReport`, `exportDailyCsv`, `registerNotificationEvent`, `enqueueNotification`, `processPendingNotifications`, `getNotificationSettings`, `updateNotificationSettings`, `getDeliveryHistory`. `createReportService`, `createNotificationService`, PostgreSQL adapters, official LINE/WeChat and injected email adapters, and daily scheduler helpers are also exported. See README and `types.ts` / `server/notification-types.ts` for typed results and injected interfaces.

`migrations/001_report_notification.sql` adds settings, recipients, event registry, durable outbox and delivery log tables with primary/foreign/unique keys, indexes, timestamps and bounded retry scheduling. It leaves Core migrations unchanged. The existing `round_entries` FORCE RLS member policy must be addressed with an authorized reporting role/policy before live cross-member reports can be correct. This is an integration prerequisite, not a verified live capability.

Suggested environment variable names: `DATABASE_URL`, `LINE_OA_CHANNEL_ACCESS_TOKEN`, `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM`, `WECHAT_APP_ID`, `WECHAT_APP_SECRET`, `REPORT_DAILY_TIME_BANGKOK`. Values are supplied privately at integration time; none are in this module. Additional provider-specific names may be needed. Official provider network access and account messaging eligibility must be configured and tested before activation. Quotas or costs may apply under the selected plans.

`examples/nextjs-integration.md` describes future Core event hooks, private worker, Admin Auth guards (`requireAdmin` and `requireAdminMutation`), thin routes and client view mapping. Camera merge collision points are `app/page.tsx`, `app/globals.css`, `lib/rounds/store.ts`, and any future camera/worker hook. No Core, camera, OCR, wallet, member or round file was changed here.

## Complete module file list

All paths are relative to `modules/report-notification/`:

- `DELIVERY.md`
- `README.md`
- `client/NotificationSettings.tsx`
- `client/ReportDashboard.tsx`
- `client/index.ts`
- `client/styles.module.css`
- `client/view-types.ts`
- `examples/nextjs-integration.md`
- `examples/notification-settings-mobile.png`
- `examples/preview.tsx`
- `examples/report-dashboard-desktop.png`
- `examples/report-dashboard-mobile.png`
- `index.ts`
- `migrations/001_report_notification.sql`
- `server/delivery-queue.ts`
- `server/email-adapter.ts`
- `server/line-admin-adapter.ts`
- `server/notification-service.ts`
- `server/notification-types.ts`
- `server/postgres.ts`
- `server/report-service.ts`
- `server/report-store.ts`
- `server/scheduler.ts`
- `server/templates.ts`
- `server/wechat-adapter.ts`
- `tests/module.test.ts`
- `tests/notification.test.ts`
- `tests/postgres-adapter.test.ts`
- `tests/report.test.ts`
- `types.ts`
