# PAIR LIVE — verified URLs and AdSense onboarding (2026-11-13)

## Verified in Railway
- Project: `pair-live-v14-9-staging`
- Environment: `staging` (not a dedicated production environment)
- Service: `pair-live-web`
- Public host: https://pair-live-web-staging.up.railway.app
- Deployed source branch: `feat/pair-live-v14-9-single-oa-railway`
- Deployed commit: `759ac00c18d6e262939dd8a6e8548ddc022e5a34`
- Deployment status at inspection: SUCCESS (2026-11-13)
- Custom domains in this Railway environment: NONE

## Existing Vercel alias
https://pair-live.vercel.app is a historical URL; do not present it as the verified Railway URL or infer that it routes to the Railway service.

## AdSense signup rule
Do not enroll a temporary staging hostname as the final production property. First settle the canonical public production domain, verify its DNS/HTTPS, ensure content is publicly crawlable or supports authorized crawler access, complete privacy disclosures, then submit the real domain for AdSense review. AdSense approval is not yet confirmed. An app only reachable via LINE login may face site-review constraints.

## Changes made / not made
This file documents the verified environment only. No changes to `DATABASE_URL`, `NEXT_PUBLIC_APP_BASE_URL`, LINE configuration, Railway deployments, production DNS, or Vercel alias. The ads preview remains a mock with no Google ad code.

## Next actions
1. Choose a dedicated production domain and verify ownership.
2. Configure it in the Railway environment intended for production, with DNS records verified.
3. Review public app URL and callback settings before making changes.
4. Test member login, LIVE, wallet and full OA flow on new domain.
5. Apply for AdSense on the final website when eligible.
