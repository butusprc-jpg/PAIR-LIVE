# Future PAIR LIVE integration contract

These examples describe a future Core change. No route or Core file is installed by this branch. Use the existing checkout and coordinate the merge with the camera owner.

## Database and service factory

Apply `modules/report-notification/migrations/001_report_notification.sql` with an approved migration role after `migrations/001_members.sql` and `002_round_engine.sql`. Do not run it automatically on app start. Provision a private reporting connection for aggregate `round_entries` reads: the existing forced owner RLS otherwise hides other members. Keep credentials out of source, client props and logs. Inject the PostgreSQL report reader and notification store into `createReportNotificationModule`, along with provider adapters and a trusted clock/logger. The factory does not read environment variables itself.

The report reader selects `rounds.id, opens_at, closes_at, duration_minutes, status, settled_at, result_number`. It reads individual `round_entries` with member IDs and sides to count distinct members, entries and demo points. The `members` table is shared by LINE and WeChat membership; no provider filter is applied. The Bangkok day query must use `(opens_at AT TIME ZONE 'Asia/Bangkok')::date = $1::date`. Base schema does not record camera evidence; an optional verified Core evidence adapter may supply a real evidence state later. Otherwise return `NOT_AVAILABLE`.

## Core event bridge

Core emits events only after its own committed state transition. A small private hook calls `enqueueNotification` with a stable event ID such as `round:<roundId>:closed` or `round:<roundId>:settled` and a string/number payload derived from database rows. This registers the event and recipient deliveries; retries with the same key are safe. Do not emit `ROUND_SETTLED` until the round is `SETTLED` with a confirmed OCR result. The composed factory rechecks the round through the injected report reader and compares OCR, parity, side totals and evidence fields before writing to the outbox. The module never calls `tickRoundEngine` or changes a round's status.

When the Core camera/stream/worker code records a verified fault, it may emit `CAMERA_OFFLINE`, `STREAM_OFFLINE`, or `WORKER_ERROR`. Do not infer a fault from silence in the report module. `OCR_REVIEW_REQUIRED` requires the Core review transition. Daily scheduler derives the Asia/Bangkok calendar day and creates a stable `DAILY_SUMMARY` event ID. Test the timezone boundary and restart behavior before turning on a production scheduler.

## Delivery worker

Run a private background worker that invokes `processPendingNotifications()` on a schedule. PostgreSQL `FOR UPDATE SKIP LOCKED` and leases prevent two workers from processing the same row simultaneously. Leases allow restart recovery. Retry is bounded and only for transient failures; permanent errors move to `FAILED`, missing credentials to `NOT_CONFIGURED`, unsupported WeChat capability to `NOT_SUPPORTED`. Keep a separate dashboard badge for provider accepted (`SENT`) and confirmed user read if a provider ever supplies that evidence. Do not claim read/delivery from a successful HTTP response alone.

Provider setup uses official APIs: LINE Messaging API push with OA channel access token and authorized LINE user ID; an injected email transport with Thai HTML/plain text; WeChat OA only with a documented message type, recipient OpenID and account permission. Confirm recipient eligibility and provider quotas before enabling. Set network policy for required official API hosts and the chosen email service, keeping TLS validation on.

## Admin Auth guards and thin routes

The Admin Auth module exists separately on `feat/pair-live-admin-auth` at commit `3abc6f025990e342db4806aa4850fc1bd6ce7641`. Its `requireAdmin(request, roles)` and `requireAdminMutation(request, roles)` return typed results. After both modules are integrated, host routes should call guards before service methods; do not trust browser role state.

```ts
// Example future GET /api/admin/reports/daily?date=YYYY-MM-DD
const access = await adminAuth.requireAdmin(request, ['admin','operator','viewer']);
if (!access.ok) return Response.json({ok:false,error:access.error},{status:403});
const date = new URL(request.url).searchParams.get('date') ?? '';
return Response.json(await reportNotification.getDailyReport(date), {headers:{'Cache-Control':'no-store'}});

// Example future POST /api/admin/notification-settings
const edit = await adminAuth.requireAdminMutation(request, ['admin']);
if (!edit.ok) return Response.json({ok:false,error:edit.error},{status:403});
// Validate a bounded settings payload server-side, then call updateNotificationSettings.
```

The browser obtains a one-use `{purpose:'mutation'}` challenge through Admin Auth and sends `X-Admin-CSRF` with the write. Reads call `requireAdmin`. Export CSV is a read but can expose member activity; guard it and send `text/csv; charset=utf-8`, a sanitized filename and `Cache-Control: no-store`. Do not add unauthenticated report or settings APIs. Never return recipient secrets or provider credentials.

## Components and merge boundary

Mount `ReportDashboard` and `NotificationSettings` from `modules/report-notification/client` inside a guarded admin page. Feed them sanitized, authorized report/settings view models and callbacks. Until Admin Auth is integrated, component settings remain mock/adapter state and no Core route should persist user changes. Import server functions only from the module server entry point; never bundle provider adapters in client code.

Future Core files likely to be added or touched: a private service factory in `lib/server/`, guarded `/api/admin/reports/*` and `/api/admin/notification-settings` routes, an admin page, a private worker entry, and a small event hook after round/camera transitions. `app/page.tsx`, `app/globals.css`, `lib/rounds/store.ts` and camera worker files are collision points with the parallel camera branch. Coordinate those edits at merge time. This module itself changes none of them. No merge, deploy or streaming work is part of this branch.

Real LINE/WeChat/email and PostgreSQL integration requires credentials, recipient opt-in/account permissions, approved networking and an authorized database. Fake-adapter test success is not evidence of real delivery.
