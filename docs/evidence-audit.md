> Historical context: the integration removed the LiveKit runtime. Current LIVE behavior is in [External LIVE URL V7](external-live-v7.md).

# Evidence, round statistics, and result audit — work 6/8

## What is active

`GET /api/round/history` requires a verified member session and returns recent rounds with Bangkok date, timestamps, status and database aggregates. The SQL counts distinct member IDs separately from entry count and sums DEMO points. It requests `row_security=off` for this aggregate, so a role unable to read all entries fails instead of silently reporting filtered zero totals. Deploy with a deliberately privileged reporting role or a reviewed SECURITY DEFINER aggregate; PostgreSQL integration is not tested here.

`GET /api/round/evidence/{roundId}` requires a member session and returns metadata only for evidence marked VERIFIED in a SETTLED round. `?evidenceId={id}&kind=crop|original` proxies one matching PNG after round/evidence ID validation, server-side storage lookup, hash verification, and a 5 MiB limit. It never accepts an object key. Responses are private/no-store and `nosniff`. Missing evidence is shown as “ยังไม่มีภาพหลักฐาน”. No fixture image is wired to this API. The admin evidence API remains 403 while the separate Admin Auth module is unintegrated.

Storage is content-addressed by SHA-256, accepts only bounded PNG files, and never overwrites different bytes. `LocalEvidenceStorage` is for private development storage only; `FakeEvidenceStorage` is for tests. `EvidenceStorage` is the private production object-store adapter boundary. No production bucket, credentials or real evidence exist in this environment. Metadata lives in `round_ocr_evidence`, binary images remain in storage. `verifyEvidenceIntegrity(id)` rehashes both images. `004_evidence_audit.sql` adds verification status/timestamp, a partial index and immutable audit-log trigger. It emits no events by itself. No real OCR result is currently settled or audited.

## Integration boundaries

The report module was inspected read-only at `feat/pair-live-report-module` commit `1d5a7d8e37bea510d4ae056f40cfd1b1aea184cb`. Its public `createReportService`, `ReportReader`, and `dailyCsv` are the integration path; `lib/evidence/report-contract.ts` defines the handoff. Its current `formatRound` accepts only integer OCR strings (`/^\d+$/`), so it must be updated to preserve decimals before a merge. It also needs the evidence status supplied by Core. CSV and notification delivery are not copied, merged or tested in Core. `ROUND_SETTLED`, `OCR_REVIEW_REQUIRED`, and `WORKER_ERROR` are contract types only; no outbox event is emitted until real settlement exists.

The Admin Auth module was inspected read-only at `feat/pair-live-admin-auth` commit `3abc6f025990e342db4806aa4850fc1bd6ce7641`. No admin role is wired into Core. Admin evidence UI is explicitly DEMO, and its API denies access. Enabling review, result confirmation or historical audit inspection requires its server-side role guard and CSRF handling. This task does not modify settled results.

Apply migrations 001–004 in order with a migration role. Grant runtime database access only to the required tables/functions. The audit log and OCR evidence rows are append-only after migration 004. PostgreSQL migration, RLS behavior under the deployment role, object storage, actual LiveKit capture and physical scale evidence are NOT TESTED here. Tests cover local/fake storage and pure aggregate semantics; they do not stand in for live integration.
