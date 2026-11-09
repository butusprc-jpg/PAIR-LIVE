# V14.6 member LIFF and session startup

An existing member cookie now makes `/api/auth/session` the first and only authentication startup request. The public `/api/auth/runtime` lookup is made only after an explicit 401. A 503 or malformed session response shows an error and never triggers a new LINE login. The existing HttpOnly, Secure-in-production, SameSite=Lax, 12-hour cookie remains the sole server-side member authority; the browser never supplies a member ID.

After a successful LINE token verification and cookie issuance, the page confirms the cookie with `/api/auth/session` and hydrates without a full reload. Wallet and entry history load independently after the member view appears. The LINE LIFF SDK is imported only when LIFF initialization is needed; QR and external LIVE controls use the initialized LIFF client rather than importing the SDK eagerly. No LINE messages are sent by this flow.

Tests cover session-first startup, skip of runtime lookup for a valid cookie, the 401 fallback, and fail-closed behavior on session outage. GitHub Actions runs the existing synthetic OA PostgreSQL integration plus typecheck and build. Real LINE mobile LIFF and a protected Vercel Preview still require an authorized test session; local browser timing and network traces are not asserted by these unit tests.
