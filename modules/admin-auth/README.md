# PAIR LIVE admin authentication

An opt-in Node.js module. Nothing in `app/`, members, cameras, streaming, rounds, or wallet is wired to this module. The existing `/api/admin/session` remains closed. Server imports and client imports are separate:

```ts
import {createAdminAuth, createPairLiveLineProvider, createPostgresAdminAdapters} from '@/modules/admin-auth';
// In a client component only:
import {AdminLogin, AdminProfile, AdminLogout} from '@/modules/admin-auth/client';
```

## Trust and reuse

No LekHub source archive was present in the workspace. PAIR LIVE's `lib/auth-core.ts` supplies the existing LINE access-token/channel/expiry/profile verifier; `server/adapters.ts` adapts it. The default login component dynamically reuses `lib/liff.ts` (already documented as adapted from LekHub). It also accepts an existing LIFF token callback. No LekHub members, database, credentials, admin-session implementation, or real user records were copied.

Only verified LINE identities explicitly listed by the server are authorized. Members are never consulted or promoted. The database stores an allowed identity's profile, not its permission; the server allowlist supplies the current role on every session check. Disabled database identities remain disabled after login. `admin`, `operator`, and `viewer` are exact roles, not an implicit hierarchy: callers specify the roles each operation permits.

## Configuration

The module reads no server environment variables itself. The host constructs `AdminAuthConfig` and injects a LINE provider, database, and session store. Missing or malformed configuration denies access. Suggested host variable names:

| Name | Purpose |
| --- | --- |
| `LINE_CHANNEL_ID` | Expected LINE Login channel; reuse the member configuration when appropriate |
| `NEXT_PUBLIC_LINE_LIFF_ID` | Public LIFF app ID; existing client helper reads this |
| `ADMIN_AUTH_ORIGIN` | Exact trusted origin, HTTPS in production |
| `ADMIN_AUTH_ALLOWLIST_JSON` | Server-only JSON array of `{userId, role}` entries; no default admin |
| `DATABASE_URL` | Private PAIR LIVE PostgreSQL URL with trusted TLS |

Never prefix the allowlist or database URL with `NEXT_PUBLIC_`. Do not serialize server configuration into React props. LINE verification needs HTTPS access to `api.line.me`; browser LIFF needs its normal LINE Login configuration. No real LINE credentials or database URL were available during development; real LINE and PostgreSQL integration are **NOT TESTED**. Fake-adapter integration does not establish live-provider readiness.

## Public API

`createAdminAuth(config)` returns:

| Method | Contract |
| --- | --- |
| `verifyAdminIdentity(token)` | Verify LINE server-side, enforce channel and allowlist, resolve private identity |
| `createAdminSession(identity, previousToken?)` | Accept only a verified capability from this factory, generate fresh random token, rotate previous session |
| `getAdminSession(request)` | Check dedicated admin cookie, hashed store record, expiry, revocation, active identity and current allowlist |
| `requireAdmin(request, roles?)` | Authenticate and enforce optional exact role list |
| `revokeAdminSession(session)` | Revoke a verified session |
| `requireAdminMutation(request, roles?)` | Authenticate, enforce roles and consume a one-use mutation challenge |
| `handleAdminChallenge(request)` | POST `{purpose:'login'|'logout'|'mutation'}`; return one-use CSRF token and HttpOnly binding cookie |
| `handleAdminLogin(request)` | POST `{accessToken}` with `X-Admin-CSRF`; rotate admin session |
| `handleAdminLogout(request)` | POST with logout challenge; revoke session and expire cookie |
| `handleAdminSessionCheck(request)` | GET public profile and expiry, never raw session token |

Low-level methods return typed `Result<T>` (`ok/value` or `ok/error`). HTTP handlers return `{ok:true,...}` or `{ok:false,error:code}` with no-store responses. See `types.ts` for complete interfaces. Node-only crypto imports and runtime assertions enforce the server boundary; keep server exports out of client bundles and use `runtime = 'nodejs'` for Next.js routes.

## Sessions, CSRF and operations

Sessions use 256-bit cryptographic randomness, domain-separated SHA-256 hashes in storage, a distinct admin cookie, HttpOnly, SameSite=Lax, and Secure in production. No member cookie is accepted. HTTPS is required in production; explicit development permits HTTP loopback origins only. Never use development configuration on a public host.

Every state-changing browser request checks the configured exact Origin and a short-lived, purpose-bound, one-use challenge. Challenges are also bound to the current admin token (or anonymous pre-login context), and the store must consume them atomically across workers. Do not replace this operation with a read followed by a delete. A second replay fails. LINE access tokens remain bearer credentials: one-use application challenges prevent request replay, but cannot make a stolen upstream token safe. Do not log provider tokens or HTTP request bodies. Configure edge rate limits for login/challenge endpoints, normal request body limits, and a restrictive host CSP.

Use the PostgreSQL adapter with a private pool and explicit migration; never use an in-memory fake in production. Rebuild/restart factories when an environment-backed allowlist changes. Database identity disabling is checked on each request. Periodically remove expired challenges and expired/revoked sessions with a private maintenance role under the operator's retention policy.

Apply `migrations/001_admin_auth.sql` using a migration role, not automatically during startup. It creates `admin_identities`, `admin_sessions`, `admin_audit_logs`, and `admin_auth_challenges` with uniqueness, foreign keys, hash checks and indexes, and revokes PUBLIC access. Grant a private runtime role only the listed permissions at the migration's end. The adapter never touches member or round tables.

## Development checks

From `/workspace/PAIR-LIVE`:

```sh
npm ci --no-audit --no-fund
npm test
npx tsx --test modules/admin-auth/tests/*.test.ts
npm run build
```

The existing `npm test` script covers only `tests/*.test.ts`; the second command is required to run this module's isolated tests without changing the Core package manifest. Tests use fake providers/storage and injected HTTP responses; they need no camera, streaming service, LINE secret, or database. A skipped existing PostgreSQL test is not a passed live integration.

See [Next.js integration](examples/nextjs-integration.md) for future installation, role guards, and merge boundaries. The mobile screenshot is a local component fixture only; it does not provide an admin API or production demo identity.
