# External LIVE V12

CameraFi Live publishes to the shop's own YouTube account. The module stores only a validated video ID. It never receives a stream key or calls YouTube Data API. Admin **Start** controls the member iframe; it cannot start or stop CameraFi/YouTube.

The V8–V11 `external_live_settings` singleton is left intact by migration 028. It is not automatically associated with an OA: a privileged admin of the connected, verified OA must check and save the YouTube URL into the new per-OA row. No old LIVE status is carried forward automatically. Rollout order: apply migration 028 to an isolated PostgreSQL test database, deploy code and migration together in the intended environment after review, then save the shop URL and explicitly start display. No production migration is performed by this branch.

The current server supports one connected LINE OA. The login channel and messaging token must verify that OA; member identity must be LINE on that same login channel. Other tenants remain separate database rows, with OA scoped RLS and server-selected OA ID. Additional simultaneous OA connections require new authentication binding and tests before advertising multi-tenant support.

The display schedule is separate from round duration and LINE countdown. Polling projects phases from server timestamps without a worker. A stopped or inactive OA remains off. Anyone who already knows the YouTube URL may still watch on YouTube when the PAIR LIVE player is hidden. Valid URL syntax does not establish that YouTube is currently streaming or permits embedding.

## V14 LINE SHOPPING LIVE runtime

The active LIVE routes use LINE SHOPPING links per LINE OA in migration 033. A privileged owner must bind each LINE Login channel to its OA in `line_shopping_live_channel_bindings` and bind the runtime database role to the same OA in `external_live_role_bindings`; the existing single-OA environment binding remains a compatibility fallback. The legacy YouTube and VDO.Ninja tables are retained for migration history, but active routes do not read or write them. Saving a new link hides the prior link until an admin/operator explicitly enables display. Members see a link only for their own OA. PAIR LIVE does not verify the upstream video signal or control the LINE SHOPPING publisher. Official eligibility, URL format, LIFF embedding, and status API must be confirmed with LINE before production release.

V14.1 does not guess a LINE SHOPPING LIVE URL format. Saving is fail-closed until `LINE_SHOPPING_LIVE_ALLOWED_ORIGIN` and `LINE_SHOPPING_LIVE_PATH_PREFIX` are set from a verified real link and official documentation. Automated tests use `https://live.example.test/live/` only as synthetic fixture data. This configuration is server-only and never entered by the shop admin.
