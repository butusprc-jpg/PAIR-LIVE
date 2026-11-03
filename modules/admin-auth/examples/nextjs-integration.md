# Integration contract (future Core work only)

These snippets are not installed routes. This branch does not modify Core. All paths in the following table are **future host changes** and must be reviewed with the camera owner before integration.

| Future file | Purpose / collision boundary |
| --- | --- |
| `lib/server/admin-auth.ts` (new) | Construct singleton dependencies and configuration on the server |
| `app/api/admin/auth/{challenge,login,logout,session}/route.ts` (new) | Thin adapters; separate from member routes |
| `app/api/admin/session/route.ts` (existing) | Decide whether to delegate to the new session handler; currently stays denied |
| Existing admin page or new `app/admin/page.tsx` | Mount client components; do not edit LIVE `app/page.tsx` without coordination |
| Future round-settings / reports routes | Require explicit admin role and mutation CSRF for writes; never change round logic here |

`app/page.tsx` and `app/globals.css` are potential camera/UI collision points and are untouched. No camera, streaming, OCR, wallet, result, member migration, or Round Engine file needs modification to run this module's tests. Do not merge/rebase the camera branch as part of this work.

## 1. Explicit database migration

Use an approved PAIR LIVE database, not LekHub. The database must already be reachable through supported networking. Supply the database URL securely to the process, not on a command line or in source control:

```sh
# With libpq connection variables configured securely, using a migration role:
psql -v ON_ERROR_STOP=1 -f modules/admin-auth/migrations/001_admin_auth.sql
```

Grant the private runtime role only the permissions documented at the end of the SQL file. Configure trusted PostgreSQL TLS for remote connections. Do not disable certificate validation. This migration is independent of `migrations/001_members.sql` and `002_round_engine.sql`.

## 2. Host server factory

Example future `lib/server/admin-auth.ts`:

```ts
import 'server-only';
import {createAdminAuth, createPairLiveLineProvider, createPostgresAdminAdapters} from '@/modules/admin-auth';
import {database} from '@/lib/server/db';

// Do not catch parse errors and invent an admin or use client-provided roles.
const allowlist: unknown = JSON.parse(process.env.ADMIN_AUTH_ALLOWLIST_JSON || '[]');
if (!Array.isArray(allowlist)) throw new Error('admin_not_configured');
export const adminAuth = createAdminAuth({
  channelId: process.env.LINE_CHANNEL_ID || '',
  origin: process.env.ADMIN_AUTH_ORIGIN || '',
  allowlist, // Validate with your config loader; factory also validates entries at runtime.
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  identityProvider: createPairLiveLineProvider(),
  ...createPostgresAdminAdapters(database()),
});
```

The adapter calls the existing member-work verifier with the configured channel, then authorization remains entirely separate. Alternatively inject an existing `LineIdentityProvider` whose `verify(token, channelId)` performs the same server verification. Never adapt a browser profile into a verified identity. No secrets belong in the client bundle.

## 3. Thin routes

Each file exports only the required method and pins Node runtime. For example the future login route:

```ts
import {adminAuth} from '@/lib/server/admin-auth';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return adminAuth.handleAdminLogin(request);
}
```

| Route under `/api/admin/auth` | HTTP method | Delegate |
| --- | --- | --- |
| `challenge` | POST | `handleAdminChallenge` |
| `login` | POST | `handleAdminLogin` |
| `logout` | POST | `handleAdminLogout` |
| `session` | GET | `handleAdminSessionCheck` |

No GET handler may perform logout or another write. Keep module response cookies and no-store headers intact. The challenge and action must share the application's origin and browser credentials.

## 4. UI slot and session restoration

In a future admin client component, import only the client barrel. A successful login supplies a public session profile. On page load call the session route to restore it; treat errors/expiry as signed out. Clear the profile after successful logout. Do not show admin controls merely because a profile was cached.

```tsx
'use client';
import {useState} from 'react';
import {AdminLogin, AdminProfile, AdminLogout, type AdminClientSession} from '@/modules/admin-auth/client';

export function AdminAccount() {
  const [session, setSession] = useState<AdminClientSession | null>(null);
  return session ? <>
    <AdminProfile session={session} />
    <AdminLogout onLoggedOut={() => setSession(null)} />
  </> : <AdminLogin onAuthenticated={setSession} />;
}
```

The default login callback reuses `lib/liff.ts`; inject `obtainAccessToken` to use the host's initialized LIFF instance. The shared LIFF browser login is not a shared server session. Never revoke a member session as an admin logout side effect. The fixture `mobile-preview.tsx` renders the real login component with an injected callback that raises a missing-configuration error and a visible fixture label. It has no API route and grants no identity.

## 5. Guard every privileged operation

For reports, call `requireAdmin(request, ['admin','operator','viewer'])` and only query reports after an `ok:true` result. Do not trust a browser `role`, `adminId`, or a member cookie. Apply report-level access constraints in the host service as needed.

For a future endpoint that changes the duration of the next round:

```ts
const access = await adminAuth.requireAdminMutation(request, ['admin']);
if (!access.ok) return Response.json({ok:false,error:access.error}, {status:403});
// Only now validate duration and invoke the existing round-settings service.
// Do not alter an already-open round, calculate outcomes, or touch streaming here.
```

The browser first POSTs `{purpose:'mutation'}` to the challenge route, then supplies its returned token in `X-Admin-CSRF` on the protected write, with same-origin cookies. A token is single-use; get a new challenge after failure or for the next mutation. An unauthorized role cannot obtain a successful guarded operation even with a valid challenge. Reads use `requireAdmin`; writes use `requireAdminMutation`. Apply this pattern to any future report export that mutates state.

## Validation boundary

Module tests use fake providers and stores and verify HTTP handlers directly without installing a public test API. PostgreSQL adapter tests verify SQL contracts with an injected query double. Neither constitutes live LINE login or an executed PostgreSQL migration. Those real integrations require an approved configured database, explicit allowlist, LINE app configuration, and HTTPS origin. Real integration remains **NOT TESTED** until those checks are actually run.
