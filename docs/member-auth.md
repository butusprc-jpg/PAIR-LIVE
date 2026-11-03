# PAIR LIVE member authentication setup

This task reuses the LIFF initialization pattern from LekHub `lib/liff.ts` and the server token verification pattern from `lib/server/line-member.ts`. It does **not** reuse LekHub's database, credentials, admin session, or real member data. The UI remains a demo in `npm run dev`; production requires a verified member session. Production admin is closed until a separate verified admin identity and role policy are implemented.

## Configure

Set these names in the server environment (values must be supplied securely):

- `DATABASE_URL`: PAIR LIVE PostgreSQL connection, with a trusted TLS certificate.
- `NEXT_PUBLIC_LINE_LIFF_ID`: LIFF ID for the PAIR LIVE LINE Login channel. This is public client configuration.
- `LINE_CHANNEL_ID`: Expected LINE Login channel ID, checked against the server's token verification response.
- `WECHAT_APP_ID`, `WECHAT_APP_SECRET`, `WECHAT_REDIRECT_URI`: WeChat OA web OAuth app ID, server secret, and exact callback URL. Configure only when the OA account supports `snsapi_userinfo`.

Run `migrations/001_members.sql` against a *new PAIR LIVE database* before trying provider login. The app database role should have only the table permissions it needs. Member routes always derive member ID from the HttpOnly session cookie; browser-supplied IDs are ignored. The schema revokes public table access. Do not expose `DATABASE_URL` in the browser.

The HTTPS egress policy must permit `api.line.me`, `api.weixin.qq.com`, and `open.weixin.qq.com` for their respective provider flows. No provider credentials or database are configured in this checkout.

## LINE Rich Menu

Set LIFF endpoint to the deployed PAIR LIVE origin. Use these URLs as LIFF/Rich Menu targets:

- LIVE: `https://YOUR_ORIGIN/`
- My history: `https://YOUR_ORIGIN/?entry=history`
- My account: `https://YOUR_ORIGIN/?entry=account`

In LINE's in-app browser, the client initializes LIFF once, redirects through LINE Login when needed, submits the access token to `/api/auth/line`, and returns to the original URL. The server verifies token expiry and channel with LINE, obtains the authorized profile, then resolves `(provider, channel, user ID)` to the existing member or creates one. The redirect is attempted only in the `login` state; errors move to a separate error state to prevent loops. A LINE OA friendship alone is never accepted as authentication.

## WeChat OA

Use `/api/auth/wechat/start?next=/` as the OA menu URL when the account and credentials are ready. `start` creates a short-lived state cookie and redirects to WeChat OAuth. The callback checks state, exchanges the code server-side, requires `snsapi_userinfo`, verifies the OpenID on the profile response, and resolves `(wechat, app ID, OpenID)` independently of LINE. LINE and WeChat accounts are never merged automatically. Without credentials the route returns `wechat_not_configured` (503).

## Limits

No real provider login was possible during this task because credentials and PAIR LIVE database access were absent. No production points, payments, or actual history transactions are implemented. The authenticated UI shows server profile and owner-scoped history; the LIVE entry form remains a developer demo and is disabled for real sessions. Admin remains denied by `/api/admin/session` (403) and the UI only exposes its demo view in development. Real admin authorization, provider live tests, and migration execution require separate configuration.
