# External LIVE V12

CameraFi Live publishes to the shop's own YouTube account. The module stores only a validated video ID. It never receives a stream key or calls YouTube Data API. Admin **Start** controls the member iframe; it cannot start or stop CameraFi/YouTube.

The V8–V11 `external_live_settings` singleton is left intact by migration 028. It is not automatically associated with an OA: a privileged admin of the connected, verified OA must check and save the YouTube URL into the new per-OA row. No old LIVE status is carried forward automatically. Rollout order: apply migration 028 to an isolated PostgreSQL test database, deploy code and migration together in the intended environment after review, then save the shop URL and explicitly start display. No production migration is performed by this branch.

The current server supports one connected LINE OA. The login channel and messaging token must verify that OA; member identity must be LINE on that same login channel. Other tenants remain separate database rows, with OA scoped RLS and server-selected OA ID. Additional simultaneous OA connections require new authentication binding and tests before advertising multi-tenant support.

The display schedule is separate from round duration and LINE countdown. Polling projects phases from server timestamps without a worker. A stopped or inactive OA remains off. Anyone who already knows the YouTube URL may still watch on YouTube when the PAIR LIVE player is hidden. Valid URL syntax does not establish that YouTube is currently streaming or permits embedding.

## V14 VDO.Ninja runtime

The active `/api/admin/live` and `/api/live` routes now use the VDO.Ninja singleton visibility flag added by migration 032. Configure `VDO_NINJA_STREAM_ID` on the server (test default `UzsGTCK`). Only admin/operator sessions can change visibility with CSRF and revision checks. Member responses contain only the viewer URL while visible; the publisher URL is returned only to admin/operator sessions. The old YouTube tenant tables and parsing code are retained for historical migration compatibility, but are not used by active LIVE routes. Visibility is not proof of a stream: the iframe checks advancing decoded frames and displays CONNECTING until then. Stopping display never stops the publisher camera. The viewer URL necessarily reveals the stream ID, and VDO.Ninja push ID alone is not secure publisher authentication. Check real camera, LINE WebView playback, autoplay, sound, and viewer load before production use.
