# PAIR LIVE — Rental release gate (2026-11-16)

## Single source of truth
- Source: `butusprc-jpg/PAIR-LIVE`, branch `main`.
- Runtime: Railway Web + one Round Worker; no Vercel cutover. A production deployment must record the exact same Git SHA on both services.
- Existing LINE OA, member identities, financial ledgers and backups are authoritative. Never reset or seed them for launch.
- GitHub default branch remains `feat/pair-live-v1` until explicitly changed in repository settings; creating `main` did **not** change the default.
- `vercel.json` intentionally disables Git deployment to avoid accidental alternate hosting.

## Release blockers — do not advertise multi-customer rental as live yet
1. **Schema drift:** production Neon `neondb` has migrations 040–049 but not `050_one_shot_ocr.sql`; table `round_ocr_one_shot_claims` is absent. Capture a fresh, verified recoverable database backup and rehearse rollback before applying migration 050. Do not modify live financial rows.
2. **Worker drift:** the current Railway Round Worker is pinned to `9f67a893...` while the Web runs newer `main`. Promote the same validated release SHA after migration and one-shot safeguards pass. Keep one worker replica; never run two settlement owners.
3. **Camera/OCR:** conduct a real VDO.Ninja publisher capture through persisted ROI and evidence review. Reading a result in a manual test does not constitute verified automated settlement.
4. **LINE:** verify the unchanged LINE Login/OA flow and send/receive results with a controlled test recipient, including retries, quotas and duplicate-prevention. Do not send test broadcasts to production members.
5. **Multi-tenant rental:** the deployed architecture is a *single-OA* operational path. The alternative Multi-OA credential/scoped-webhook branch is divergent and **not** part of main. Before onboarding a second independent customer, verify tenant-scoped authentication, secrets, finance, camera, member data, outbox, quotas, access control and isolation under negative cross-tenant integration tests.
6. **Commercial operations:** define subscription start/end, pause/expiry, renewal and owner controls; validate the real billing and OA provisioning lifecycle. Existing service controls alone are not evidence of complete paid-tenant provisioning.
7. **Secrets:** rotate the Neon database password previously exposed in chat with coordinated service updates. Never store secrets in Git.

## What has been cleaned
- Closed old Draft PRs whose head commits were already ancestors of `main`; closure does not remove Git history.
- Removed unused `AdminPointsSimulation.tsx` from the active production UI. Pure simulation algorithms/tests may remain for automated regression coverage.
- Simplified user-facing labels, kept truthful unverified-result warnings, and compacted long transaction reference displays without altering transaction IDs.
- Added `release-main.yml` checks for disposable PostgreSQL 18 migrations, unit tests, TypeScript and build; it never runs against production.

## Release acceptance
- [ ] Recoverable production backup and restore test documented
- [ ] Migration 050 installed and validated with no ledger/round corruption
- [ ] Web and Worker run identical pinned SHA, health and LINE preflight pass
- [ ] Real camera one-shot frame and admin review tested; no double settlement
- [ ] Member/administrator workflows tested on mobile without prototype-only language
- [ ] Tenant isolation and subscription provisioning demonstrated for at least two OA tenants
- [ ] Rollback instructions documented and tested

Do not merge unrelated V14 LINE Shopping LIVE or the unreviewed Multi-OA branch solely to close old PRs. Both alter production-facing architecture and require dedicated integration work.
