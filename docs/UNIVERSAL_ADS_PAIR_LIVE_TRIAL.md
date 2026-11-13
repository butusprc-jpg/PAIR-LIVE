# PAIR LIVE — Universal Ads trial

This is a **non-production, no-impression** test on branch `feat/pair-live-universal-ads-preview`, based on commit `759ac00c18d6e262939dd8a6e8548ddc022e5a34`.

## Preview
Route: `/ads-preview`, not linked from the member app. It contains a fake 320 × 50 banner. No sponsor/AdSense calls, tracking, DB changes, LINE calls, or monetization.

## Layout rule
Vertical flex layout: scrollable content, reserved bottom ad zone, bottom member navigation. The ad never overlays content or PAIR LIVE navigation. In the main app, the existing fixed `.bottom` must be refactored before enabling the real slot—DO NOT simply copy its overlay positioning. On short screens preview hides its banner.

## Provider rule
In LINE embedded browsers, Google ads are disabled. Google Auto Anchor can only be integrated separately for approved external-browser contexts, using Google's own anchor (not custom sticky). Sponsor banners require a validated HTTPS image and destination, approval, consent and compliance checks. Default off; do not infer AdSense approval from user agent.

## Verification
- `npm run build` after checkout
- Inspect `/ads-preview` at 320/375/390px and short height; scroll top/bottom; no controls obscured
- Test LINE Android/iOS separately before any production changes
- Check production branch, database, gameplay, wallet and LINE remain unchanged
- Do not deploy or merge without separate approval
