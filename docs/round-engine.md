# Round Engine (work 3/8)

Apply `migrations/002_round_engine.sql` after `001_members.sql` to a PAIR LIVE PostgreSQL database. All `timestamptz` fields represent UTC instants; `round_date` is the Asia/Bangkok date, and the UI formats timestamps in Asia/Bangkok.

Start a separate supervised worker with `npm run round:worker` and `DATABASE_URL` configured. This process does not depend on an administrator's browser. On startup it reads persisted state. Each tick takes a transaction advisory lock: it opens a round only when no unfinished round exists, closes an expired OPEN round, then moves CLOSED to SCANNING on a later tick. SCANNING stays put for the future camera/OCR workflow. The worker creates no results and never starts a new round before the previous round is SETTLED or CANCELLED. A GET to `/api/round/current` also closes an expired round if the worker is temporarily down, but the supervised worker is required for autonomous progress.

Duration defaults to five minutes. With no verified admin authentication yet, there is **no public settings API**. An operator with shell/database access may run `npm run round:duration -- 3` (or 5, 10, 15, or any integer 1–60). This changes only the singleton setting and writes a `DURATION_CHANGED` audit log. It does not change `closes_at` on the open round. Keep this command restricted to trusted operators.

`GET /api/round/current` returns `serverTime`, `round` and aggregate totals. The client uses the server close timestamp with an estimated server clock offset, repolls every three seconds, and refreshes on reconnect or tab visibility. The server remains authoritative: `POST /api/round/entries` requires an authenticated member session, same-origin request, a UUID idempotency key, and validates points and round status against the database clock inside a transaction with the round row locked. Entries use DEMO points only. Replaying the same key and payload returns the original entry without another deduction. `GET /api/round/my-entries` scopes rows to the member from the session and RLS. No admin or settlement endpoint is exposed by this work.

Example response shape:

```json
{"serverTime":"2026-11-03T10:00:00.000Z","round":{"id":"1","opensAt":"2026-11-03T10:00:00.000Z","closesAt":"2026-11-03T10:05:00.000Z","durationMinutes":5,"status":"OPEN","closedAt":null,"settledAt":null,"resultNumber":null},"totals":{"even":{"people":0,"points":0},"odd":{"people":0,"points":0}}}
```

This example is schema documentation, not a live database response. The production `DATABASE_URL` is absent. During onboarding for this task, both migrations were applied to a temporary PostgreSQL 16 Docker database and `npm test` passed with a non-superuser application role. The integration test verifies the real transaction path, RLS ownership, replay protection, closure, and repeated worker ticks. Production database behavior remains untested until its own connection and migration are configured.
