# PAIR LIVE report and notification module

This is a server-side, opt-in module for reading PAIR LIVE round data and delivering operator notifications. It does not create outcomes, operate cameras, change round state, or install routes. Core later supplies verified events and Admin Auth guards. No real provider credentials or PAIR LIVE database were available for this task.

## Architecture

`createReportNotificationModule({reportReader,notifications})` composes two dependency-injected services:

- Report service reads existing `rounds` and `round_entries` through a `ReportReader`, computes per-round and Bangkok-date summaries, and exports UTF-8 BOM CSV. OCR values and parity appear only for `SETTLED` rounds with a verified numeric `result_number` and settlement timestamp. Missing evidence is `NOT_AVAILABLE`, because the base schema has no evidence column. Distinct member counts come from `round_entries.member_id`, never the `rounds.even_people`/`odd_people` counters.
- Notification service receives trusted Core events, records them in a PostgreSQL outbox, selects enabled recipients, and sends through injected LINE, email, and WeChat adapters. Worker claims are atomic with leases and bounded retries. `SENT` means provider accepted the API request; it does not mean the recipient received or opened it. A repeated Core event ID and per-recipient idempotency key cannot enqueue a duplicate delivery. A `ROUND_SETTLED` event requires the injected database status check before it is queued.

Public API on the composed object: `getRoundReport`, `getDailyReport`, `exportDailyCsv`, `registerNotificationEvent`, `enqueueNotification`, `processPendingNotifications`, `getNotificationSettings`, `updateNotificationSettings`, `getDeliveryHistory`. All reads and writes return typed `ReportResult<T>` or `NotificationResult<T>`; inspect `ok` before using `value`. The module does not perform web authorization. Future host routes must use Admin Auth's `requireAdmin()` for reads and `requireAdminMutation()` for settings writes, with explicit allowed roles. See [integration example](examples/nextjs-integration.md).

Supported Core event types are `ROUND_CLOSED`, `ROUND_SETTLED`, `OCR_REVIEW_REQUIRED`, `CAMERA_OFFLINE`, `STREAM_OFFLINE`, `WORKER_ERROR`, and `DAILY_SUMMARY`. Events must come from trusted Core code after its state transition or verified fault; the UI cannot create them. Camera/streaming failures are never inferred by this module. For daily reports, use the Asia/Bangkok date, not UTC calendar date. Daily scheduling uses a persistent event key so restarts cannot enqueue a second summary for the same local day.

## Provider behavior

LINE uses the official Messaging API push endpoint with a server-side OA channel access token. Each LINE recipient is an explicit authorized user ID. The OA and recipient relationship must permit pushes under LINE's current platform rules; an accepted API response does not prove the user read it. LINE Notify is not used. Provider calls have timeouts; rate limits and transient failures become bounded retries with exponential backoff. Providers without configured credentials return `NOT_CONFIGURED` and do not transmit.

Email is an injected provider transport: one or many recipients may opt into round events, daily summaries, or both. Messages have Thai subjects, plain text, and escaped HTML. Supply a real provider adapter with credentials only during approved integration; fake tests do not send email.

WeChat uses official OA capabilities only. Configure App ID/secret and an account-specific send policy. An OA cannot push all message types at arbitrary times. Unsupported account types, message windows or templates must return `NOT_SUPPORTED`. Check API error codes, timeouts and rate limits; never use undocumented workarounds. All recipients are explicitly configured OpenIDs.

No access tokens or secrets belong in settings rows, outbox rows, delivery logs, browser props, or logger events. Logs contain delivery IDs, channel and bounded status codes only. Notification settings UI is controlled adapter state until Admin Auth is installed and guards are active.

## PostgreSQL

Run `migrations/001_report_notification.sql` explicitly against the PAIR LIVE database after Core migrations 001 and 002. It creates settings, recipients, event registry, outbox and delivery log tables with keys, constraints, indexes, timestamps and retry leases. The outbox is the durable source of truth for worker restarts. Configure a private reporting role that can read aggregate member participation. The existing `round_entries` table has forced owner RLS; the member connection cannot see every participant. Arrange narrowly controlled reporting access through the DB owner/approved policy before live reports. Do not change Core RLS as part of this module.

Multiworker claims use PostgreSQL row locks and skip locked rows. A worker with an expired lease may be retried, so provider-side idempotency keys should be used when supported. Delivery is at least once across a process crash between provider acceptance and database completion; the outbox prevents concurrent dispatch and repeated enqueuing, but cannot guarantee exactly once transmission at that crash boundary. Verify recipient opt-in and provider capabilities in a real integration.

## Configuration names

The module accepts dependency injection and does not directly read process variables. Suggested host bindings are:

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | PAIR LIVE PostgreSQL, private reporting/worker connection with trusted TLS |
| `LINE_OA_CHANNEL_ACCESS_TOKEN` | Server-only LINE Messaging API bearer credential |
| `EMAIL_PROVIDER_API_KEY` | Server-only email transport credential if the chosen provider needs one |
| `EMAIL_FROM` | Approved sender address |
| `WECHAT_APP_ID` | WeChat OA application identifier |
| `WECHAT_APP_SECRET` | Server-only WeChat OA credential |
| `REPORT_DAILY_TIME_BANGKOK` | Local time, e.g. `09:00`; schedule from persisted settings |

These are names, never values. Other provider-specific names depend on the selected email transport and WeChat message type. Do not place private names behind `NEXT_PUBLIC_`. Production provider activation requires the appropriate network policy and credentials; they were unavailable here. LINE, email, WeChat and real PostgreSQL delivery are **NOT TESTED**; fake adapters and SQL contract tests validate module behavior only. Provider costs, rate limits, message quotas and account eligibility depend on each service's current plan.

## Development checks

From `/workspace/PAIR-LIVE`:

```sh
npm ci --no-audit --no-fund
npm test
npx tsx --test modules/report-notification/tests/*.test.ts
npm run build
```

The root `npm test` script covers Core `tests/*.test.ts`; run the separate command for this module. No cameras or streaming services are required. The existing PostgreSQL Core integration test skips when `DATABASE_URL` is absent.
