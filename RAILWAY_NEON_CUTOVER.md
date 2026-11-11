# Railway cutover gate (single connected OA)

The production Neon database remains the system of record. No point, ledger,
member, or transaction data is copied. Production wallet state is `LEGACY`;
topup and withdrawal use the existing `members.demo_points` transaction path.

## Current staging constraints

- `RAILWAY_STAGING_NO_LINE=true` deliberately blocks authentication and all
  financial APIs. Its database target guard accepts only the isolated Railway
  test database. Do not disable this flag or substitute the Neon production URL
  until the following gates are checked.
- The existing Railway worker service runs `db:migrate -- --staging-validate`,
  not `round:worker`. Do not start the real worker against production Neon while
  both sites might dispatch the same LINE outbox.
- Production Neon has migrations through `031_owner_usage_metrics.sql`; source
  also contains 032–036 and 040. Review the dependencies and apply them via a
  separately approved migration plan before pointing the new runtime at Neon.
- Railway variable names are visible, but their values have not been verified
  against the Neon branch and LINE OA. The Vercel project environment and LINE
  Console settings also need an authorized read-only comparison.

## Pre-cutover checks

1. Record and compare the host, database, branch and TLS mode of the Railway
   web and worker `DATABASE_URL` with Neon project
   `crimson-violet-22383137`, branch `br-lucky-tooth-azb57uxq`. Never log
   credentials. Confirm web and worker use the same database as the requests.
2. Inventory migration history and hashes, then review/apply only required
   migrations with backup/restore plan. Do not reset the database.
3. Compare LINE Messaging, Login, LIFF, callback and rich menu destinations
   with the current Vercel settings. Confirm OA binding and channel identity.
4. Run the synthetic PostgreSQL regression workflow and type/build checks.
   Test Railway web login, read-only balance, and synthetic request flows only
   after isolation and notification recipients have been reviewed. Do not
   create a real member request merely to test.
5. Prepare the real worker deployment (`npm run round:worker`) with the same
   verified database, OA binding and LINE credentials; ensure only one active
   worker dispatches each outbox. Verify logs and health before cutover.
6. Confirm an authorized test device opens the Railway LIFF and rich menu,
   and the LINE callback is accepted. Preserve the old URL and webhook value.

## Cutover and rollback

After the checks pass, switch the existing LINE OA webhook and LIFF/rich menu
destinations to Railway in a controlled window. Keep Vercel available but stop
its worker/notification dispatcher before starting Railway's dispatcher.
Watch webhook response codes, request IDs, outbox retries, balances and audit
rows without editing points. Roll back by restoring the recorded webhook,
LIFF/rich menu destinations and previous dispatcher ownership; never roll back
the Neon data or replay approved requests. Leave Railway PostgreSQL intact
until every service dependency is proven absent.
