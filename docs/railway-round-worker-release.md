# PAIR LIVE round worker release preparation

Use the same reviewed Git commit for the Vercel app and the Railway service `pair-live-round-worker`. The Railway service runs the existing `npm run round:worker` process. It has no public domain or HTTP port, and does not host LiveKit or PostgreSQL. Keep one replica during the first release. `railway.json` sets the production-only install, start command, and on-failure restart policy. Railway must deliver SIGTERM on shutdown; the worker finishes the current tick and closes its PostgreSQL pool.

Required Railway variables (names only):

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | Existing Neon PostgreSQL connection, with the worker's required read/write grants and TLS validation. |
| `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | Existing LINE OA channel access token for quota checks and broadcast. |
| `NODE_ENV` | Set to `production`. |

The worker does not need LiveKit credentials: it advances existing rounds and dispatches queued notifications. The Vercel app still needs its existing `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and optional `LIVEKIT_ROOM` to publish and view LIVE. The camera's successful publish calls `/api/stream/activate`; the Railway worker does not start a new round. The admin tick API also does not start a round.

Migration 019 must be reviewed and applied to the existing production database **before** starting the Railway worker or activating this app release. This repository's migration command accepts only an isolated local test database and cannot apply to Production. Apply the reviewed SQL using the production migration process; verify its checksum against `migrationManifest()` and its history record. Do not add a new database or remove existing Neon branches or backups.

Before a production release, verify that the database role used by Railway can read/update `rounds` and `round_line_broadcast_outbox`, insert `round_audit_logs`, read round settings/audits, and use the outbox round reference and sequence where needed. Verify the actual production role grants without putting credentials in logs. Confirm `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` belongs to the intended OA, quota permits the broadcast, and Railway outbound HTTPS can reach LINE Messaging API. No live broadcast should be sent as a test.

`SENT` records an accepted LINE API request, not delivery to every friend. `UNKNOWN` means the result could not be established; the same `X-Line-Retry-Key` is reused after restart. A round that has expired is never sent a late “one minute remaining” broadcast. Worker logs contain only time, round ID, status, and a safe error code.

This branch prepares configuration and tests only. Railway deployment, Vercel deployment, production migration, LiveKit device verification, and real LINE delivery remain separate release steps.
