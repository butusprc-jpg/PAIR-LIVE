# V14.7 performance and session readiness

## Session policy

- LINE login offers a remembered session (on by default for the Rich Menu flow); the option can be turned off on the login screen. Remembered cookies and database sessions have a fixed 30-day maximum. Without it the original 12-hour limit remains. WeChat retains 12 hours.
- Cookies remain HttpOnly, Secure in production, SameSite=Lax and scoped to `/`. Only the server-issued opaque token hash is stored in PostgreSQL. Every protected request checks the current member status; the browser's member ID or cached point balance never authorizes a transaction.
- On an authenticated session check after 24 hours, a remembered token rotates atomically. The prior hash is accepted for at most two minutes so concurrent tabs and requests can finish. Logout revokes the whole database row through either valid token. A lost rotation response can require a fresh LINE login after the grace window; it cannot extend the 30-day expiry.
- On returning to a visible tab, the member page checks the cookie again, clears the previous account's UI data before switching identity, and reloads wallet and history. Adaptive polling stays at 25 seconds active / 60 seconds idle, pauses while hidden, wakes on return, and now queues one immediate refresh if a transaction event occurs during an in-flight poll.

## Before production

1. Back up the database and inspect the migration history. Apply forward-only `036_member_remember_session.sql` through the existing migration process after review. Do not modify prior migrations or the wallet cutover state.
2. Review the 30-day remember setting, device/shared-phone policy and logout behavior. Test two LINE accounts, two tabs, rotation after 24 hours and a lost response on an authorized staging LIFF device.
3. Inspect the Vercel Preview and a real LINE In-App Browser with authorized synthetic accounts. The connector currently returns 403 for deployment listing; CI build is not a Preview test.
4. Measure ten minutes of authenticated request count, PostgreSQL query count and latency on an isolated environment with instrumentation, then compare with the chosen baseline. The deterministic polling tests prove cadence, not real network/database consumption. No unmeasured number is presented as a benchmark.

No production deployment, database migration, automatic OCR decision or wallet cutover is part of this branch.
