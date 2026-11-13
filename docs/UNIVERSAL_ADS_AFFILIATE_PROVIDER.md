# LINE member app: affiliate banner readiness (not live)
Provider shortlist: ACCESSTRADE TH (explicitly mentions LINE and campaign banners), Involve Asia (app/social properties; review required), Adsterra (separate network, review in-app WebView policies before use).

## Important boundaries
- Affiliate programs typically pay on validated actions, NOT page impressions. Never calculate commissions from local click counts.
- Do not ship third-party JS/popunders/forced redirects. No live placement without publisher approval, campaign-specific LINE/LIFF permission, tracking URL, licensed creative, privacy review and testing.
- AffiliateBanner is OFF by default. No credentials, tracking URLs or adverts are bundled. URL and image must be HTTPS. No birth data, LINE ID, or other sensitive profile data in links or event tags.
- Keep the advertising slot separately reserved in the layout, never overlay the member navigation.
- An ASTRO OA application repository has not yet been identified; this reusable adapter is stored in the PAIR LIVE **test branch only**, NOT the deployed app.
- To go live: publisher joins the network themselves, gets an approved campaign and tracking link, provides the authorized asset + campaign terms, and enables configuration only after testing.
## Sources checked 2026-11-13
ACCESSTRADE TH: https://accesstrade.in.th/publisher-series/
Involve Asia: https://helpcentre.involve.asia/portal/en/kb/articles/who-can-become-a-publisher-on-involve-asia
Adsterra: https://adsterra.com/monetize-traffic/
