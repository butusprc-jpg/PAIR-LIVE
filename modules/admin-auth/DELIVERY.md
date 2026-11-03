# Delivery evidence

Branch: `feat/pair-live-admin-auth`.
Base: `3963737c8f0ea392ce0fb3847f6f971fd9de3ab9`.
Validated on 2026-11-03 with Node 24.22.1, npm 11.9.0, Next 15.5.28.
The full delivered commit SHA is reported in the delivery message and can be read with `git rev-parse HEAD`.

## Checks

| Check | Outcome |
| --- | --- |
| Frozen dependency installation (`npm ci --no-audit --no-fund`) | PASS, lockfile unchanged |
| `npm run build` after module completion | PASS, compilation, type checking and 15 static pages |
| Existing `npm test` | 10 PASS, 1 SKIP (PostgreSQL round integration: no DATABASE_URL) |
| `npx tsx --test modules/admin-auth/tests/*.test.ts` | 40 PASS, 0 FAIL, 0 SKIP |
| Module HTTP integration | PASS using Web Request/Response and injected fake provider/database/store |
| PostgreSQL adapter SQL contracts | 6 PASS, included in the 40 above; query double only |
| Live LINE login | NOT TESTED, no configured LINE app/credentials |
| Real PostgreSQL migration/integration | NOT TESTED, no configured database |
| Existing app production smoke | GET /: 200 with PAIR LIVE HTML; admin session: 403 admin_not_configured; auth runtime: 200 with production demo disabled |
| Existing round endpoint | 503 round_unavailable without database; not claimed functional |
| Mobile component fixture | Chromium 390x844 CSS viewport, 2x device scale; CTA/error state visible, no horizontal overflow or page errors |
| Core source/lockfile changes | NONE |

The initial sandbox denied tsx IPC sockets and network proxy access. The same commands succeeded in the supported approved execution context; no verification, TLS, or test assertions were disabled. `node --import tsx --test` produced misleading file-only outcomes in this environment, so reported module counts use the actual tsx test runner above.

## Scope and reuse

See README for public API, environment-variable names, security and schema. See examples/nextjs-integration.md for thin routes, PostgreSQL setup, round duration/report guards and future camera merge collision boundaries. LekHub source was unavailable; reuse is through existing PAIR LIVE LINE verifier and LIFF helper. No real accounts, tokens or databases were copied. No Core integration, merge, force push or deployment is part of this delivery.

## Complete module manifest

All paths below are relative to `modules/admin-auth/`:

- `DELIVERY.md`
- `README.md`
- `client/AdminLogin.tsx`
- `client/AdminLogout.tsx`
- `client/AdminProfile.tsx`
- `client/http.ts`
- `client/index.ts`
- `client/styles.module.css`
- `examples/admin-login-mobile.png`
- `examples/mobile-preview.tsx`
- `examples/nextjs-integration.md`
- `index.ts`
- `migrations/001_admin_auth.sql`
- `server/adapters.ts`
- `server/auth.ts`
- `server/csrf.ts`
- `server/guard.ts`
- `server/identity.ts`
- `server/postgres.ts`
- `server/runtime.ts`
- `server/session.ts`
- `tests/admin-auth.test.ts`
- `tests/admin-guard.test.ts`
- `tests/admin-session.test.ts`
- `tests/helpers.ts`
- `tests/postgres-adapter.test.ts`
- `types.ts`
