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
- Railway reads the repository-root `railway.json` even when the Web service
  specifies `Dockerfile.railway-web`. That root file now explicitly runs
  `node server.js`; the future worker settings are in `railway.worker.json`.
  Never attach the worker config file to the Web service. The failed staging
  deployment `e5b21805-5ac8-4bcb-bf8c-e1105a53d758` exposed this mismatch;
  its round worker was stopped by `RAILWAY_STAGING_NO_LINE` before any tick.
- Production Neon has migrations through `031_owner_usage_metrics.sql`; source
  also contains 032–036 and 040. Review the dependencies and apply them via a
  separately approved migration plan before pointing the new runtime at Neon.
- The read-only SQL in `docs/railway-neon-migration-review.sql` confirms the
  selected database and migration history. The six existing SQL files are the
  apply inputs, in manifest order: 032 adds VDO state; 033 adds LINE SHOPPING
  tables; 034 adds OA-bound VDO tables and RLS; 035 extends those VDO tables;
  036 adds member session rotation columns; 040 adds camera sites and a nullable
  `rounds.site_id`, backfilling camera rows from VDO tenants. Their source
  SHA-256 hashes are:

  | Migration | SHA-256 |
  | --- | --- |
  | 032 | `4590eac8e3b75a79da83dc3fa1502195360dd19b49e071f63ac78e178fd0e932` |
  | 033 | `f72bbf83fdfe46c6248a0f7fe1f01b3f61059e568a8b26eb30270b1b4ae6863b` |
  | 034 | `0c1bbfa9fd85e2e22df7b1bf2dad19652c2547572f86ef0c514b200be5ecae8a` |
  | 035 | `da36a651e1d1efa7631d943602d24136ab0db5bbcadd8ec574770dd8de06239c` |
  | 036 | `4af7501dd238b779a6258525317418d8c02a7df3f8444699f0088e9f19e8fe8f` |
  | 040 | `ae110e8fcdef0439e7186119ef09667e60d810fd3bd513ab9088293200b0ae1b` |

  Apply each file and its history insert in one transaction with a dedicated
  advisory lock, comparing all installed hashes first. A failed transaction
  rolls back that file. After commit, roll back the application to its prior
  commit while keeping compatible additive schema; never delete migration
  history, camera rows, members, ledger or points as a rollback shortcut.
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
