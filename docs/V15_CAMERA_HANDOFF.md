# V15 primary camera handoff

Branch: `feat/pair-live-v14-9-single-oa-railway` · Draft PR #16. This checkpoint prepares **only camera slot 1** for a pasted VDO.Ninja viewer URL. It has not been deployed or verified with a real stream.

## Data and request path

1. An authenticated LINE admin enters `/admin` and opens **กล้อง LIVE**. `components/AdminCameras.tsx` reads `GET /api/admin/cameras` and displays only slot 1, including its saved URL even while member visibility is off.
2. Admin pastes `https://vdo.ninja/?view=STREAM_ID` and clicks **บันทึก URL**. `POST /api/admin/cameras` obtains the existing server admin session and mutation CSRF. `primaryStreamId()` in `modules/external-live/server/cameras.ts` accepts only the HTTPS `vdo.ninja` root with exactly one `view` parameter and a 7–64 character ID. No arbitrary remote URL is fetched by the server.
3. `primaryCameraAction()` locks the OA site, slot 1 and its legacy `vdo_ninja_tenants` row in one PostgreSQL transaction. It updates the legacy stream ID (the member view's authority) and slot metadata, increments revisions, clears any obsolete remote publisher key on URL replacement, and writes immutable `vdo_ninja_audit`. A concurrent stale revision fails with 409. Saving a new URL while LIVE is displayed requires stopping first. The existing tenant resolver and RLS remain in effect.
4. **เริ่ม LIVE** sets `display_enabled=true`; **หยุด LIVE** sets it to false. These controls change *member visibility*, not the VDO.Ninja camera or upstream publisher. `GET /api/live/cameras` returns only enabled cameras for the authenticated member's OA; `MemberLivePlayer` uses the existing `VdoViewer` iframe. The admin preview is available before member visibility is enabled. Its `CONNECTING` state is not proof that frames exist.

The API permits dashboard GET for `admin`, `operator`, `viewer`; only `admin` saves a URL, `admin`/`operator` may start or stop, and `viewer` is read only. An unauthenticated member cannot mutate. The old publisher controls still exist elsewhere, but the camera tab uses this direct URL flow. Slots 2–4 and their data are untouched.

## Files in the camera checkpoint

- `components/AdminCameras.tsx`: single-camera URL form, preview, status, start/stop.
- `app/admin/page.tsx`: camera tab uses the direct controls.
- `app/api/admin/cameras/route.ts`: role-checked GET and CSRF-protected primary mutation.
- `modules/external-live/server/cameras.ts`: URL parsing, OA-scoped transaction, admin preview URL.
- `app/globals.css`: compact waiting badge so it does not cover the preview.
- `modules/external-live/tests/cameras.test.ts` and `cameras-db.integration.test.ts`: URL rejection and two-OA transaction scenarios.
- `components/AdminSettingsLink.tsx` and `tests/admin-navigation.test.ts`: repair an existing test mismatch introduced by the newer remote gear change; no new navigation behavior.

No migration was added. Existing migrations 034, 035 and 040 contain the relevant legacy VDO row, audit, and camera slot tables.

## Verification performed

- `npm test`: 145 tests, 123 pass, 22 skip, 0 fail. The skipped set includes PostgreSQL integration because `VDO_TEST_DATABASE_URL` was not present in this workspace.
- `npx tsc --noEmit`: pass.
- `npm run build`: pass.
- `git diff --check`: pass.
- PostgreSQL integration, browser flow, API against an authenticated admin, LINE mobile, and actual video frames: **NOT TESTED**. Local Chromium aborted with `socket() failed: Operation not permitted`; there was no authorized source stream. Do not describe the preview or live output as passed.

## Next developer steps

1. Pull the branch and inspect PR #16 and the camera checkpoint. Confirm the branch head still contains the checkpoint before new edits.
2. Use a separate non-production PostgreSQL database guarded by `assertTestTarget`. Set `VDO_TEST_DATABASE_URL` only for that test target, then run `npm test`, `npx tsc --noEmit`, and `npm run build`. Investigate any failure before deployment.
3. In a browser-enabled environment, sign in with an authorized *test* LINE OA/admin. Verify GET 200 and POST with the existing CSRF challenge. For any 403, record the response error code and check admin role, `admin_identities.provider_channel_id`, OA binding, service status and token-hash verification. Do not weaken the resolver or RLS to make the test pass.
4. Use an authorized VDO.Ninja test publisher and viewer URL. Capture a real-frame preview, then start LIVE and inspect the member view for the same test OA. Refresh the admin page to confirm the URL persists; stop LIVE and confirm the member frame disappears. Test desktop and mobile, unauthorized member POST, stale revision, invalid URL, and a different OA. A URL alone never proves video delivery.
5. Only after these gates pass, deploy the reviewed commit to the existing Railway **staging Web** service. Keep the Worker disabled and Production untouched. Confirm deployment SHA, health, API, preview and member visibility before recording PASS.

No Production database, LINE endpoint, DNS, or Railway deployment is changed by this checkpoint.
