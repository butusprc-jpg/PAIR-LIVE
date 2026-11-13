# PAIR LIVE round worker release preparation

Use the same reviewed Git commit for the Vercel app and the Railway service `pair-live-round-worker`. The service will run the existing `npm run round:worker` process after cutover approval. It has no public domain or HTTP port, and does not host LiveKit or PostgreSQL. Keep one replica during the first release. Set `Dockerfile.railway-worker`, `npm run round:worker`, and the on-failure restart policy directly in Railway. Railway must deliver SIGTERM on shutdown; the worker finishes the current tick and closes its PostgreSQL pool.

Required Railway variables (names only):

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | Existing Neon PostgreSQL connection, with the worker's required read/write grants and TLS validation. |
| `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | Existing LINE OA channel access token for quota checks and broadcast. |
| `NODE_ENV` | Set to `production`. |

The worker advances existing rounds and dispatches queued notifications. The app no longer uses LiveKit credentials. External LIVE visibility is independent of round timing; the guarded `/api/stream/activate` endpoint can start a round only when called separately. Starting the external player does not call it. The Railway worker and admin tick API do not start a new round.

The current Railway worker service is still a migration validator with zero running replicas. Its future runtime settings are recorded in `railway.worker.json`, but Railway's connector rejects selecting legacy config files. The repository-root `railway.json` was removed because it overrode the Worker build with the Web Dockerfile and caused `tsx: not found`. Set Dockerfile and start command per service in Railway. Do not start `round:worker` until the database, LINE binding, and dispatcher ownership checks pass.

Migrations 032–036 and 040 must be reviewed and applied to the existing production database **before** starting the Railway worker or activating this app release. This repository's migration command accepts only an isolated local test database or the gated Railway staging database and cannot apply to Production. Apply the reviewed SQL using the production migration process; verify its checksum against `migrationManifest()` and its history record. Do not remove existing Neon branches or backups.

To check each service's actual database target from its own Railway runtime, run `node scripts/check-runtime-db-target.mjs` with `EXPECTED_NEON_HOST` set to the read-write endpoint host of the approved Neon production branch and `EXPECTED_NEON_DATABASE` set to its database name. Run it separately in Web and Worker after both images include the script. It prints only the target class, host, database, TLS state, and match result; it never prints `DATABASE_URL`. Both results must report `target: neon`, `tls: true`, and `matchesExpected: true` before removing the staging gate or enabling the worker. The operator must independently map that endpoint host to the production branch in Neon, because the branch ID is not encoded in the PostgreSQL connection string. The current Web staging gate deliberately accepts only Railway's isolated PostgreSQL target, so do not point it to Neon while that gate is enabled.

Before a production release, verify that the database role used by Railway can read/update `rounds` and `round_line_broadcast_outbox`, insert `round_audit_logs`, read round settings/audits, and use the outbox round reference and sequence where needed. Verify the actual production role grants without putting credentials in logs. Confirm `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` belongs to the intended OA, quota permits the broadcast, and Railway outbound HTTPS can reach LINE Messaging API. No live broadcast should be sent as a test.

`SENT` records an accepted LINE API request, not delivery to every friend. `UNKNOWN` means the result could not be established; the same `X-Line-Retry-Key` is reused after restart. A round that has expired is never sent a late “one minute remaining” broadcast. Worker logs contain only time, round ID, status, and a safe error code.

This branch prepares configuration and tests only. Railway deployment, Vercel deployment, production migration, external embed verification on LINE devices, and real LINE delivery remain separate release steps.
