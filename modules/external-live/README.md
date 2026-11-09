# External LIVE V12

CameraFi Live publishes to the shop's own YouTube account. The module stores only a validated video ID. It never receives a stream key or calls YouTube Data API. Admin **Start** controls the member iframe; it cannot start or stop CameraFi/YouTube.

The V8–V11 `external_live_settings` singleton is left intact by migration 028. It is not automatically associated with an OA: a privileged admin of the connected, verified OA must check and save the YouTube URL into the new per-OA row. No old LIVE status is carried forward automatically. Rollout order: apply migration 028 to an isolated PostgreSQL test database, deploy code and migration together in the intended environment after review, then save the shop URL and explicitly start display. No production migration is performed by this branch.

The current server supports one connected LINE OA. The login channel and messaging token must verify that OA; member identity must be LINE on that same login channel. Other tenants remain separate database rows, with OA scoped RLS and server-selected OA ID. Additional simultaneous OA connections require new authentication binding and tests before advertising multi-tenant support.

The display schedule is separate from round duration and LINE countdown. Polling projects phases from server timestamps without a worker. A stopped or inactive OA remains off. Anyone who already knows the YouTube URL may still watch on YouTube when the PAIR LIVE player is hidden. Valid URL syntax does not establish that YouTube is currently streaming or permits embedding.

## V14.2 VDO.Ninja runtime

The active LIVE routes use per-OA `vdo_ninja_tenants` from migration 034. A verified OA and channel binding are required; the current single-OA server binding remains supported. The first admin read provisions a random Stream ID, unique across tenants, and later reads retain it. The test ID `UzsGTCK` is only used by tests. Historical LINE SHOPPING (migration 033) and singleton VDO state (032) are preserved but inactive. Admin/operator mutations retain Session and CSRF protection. Member responses never contain publisher URLs. Showing a viewer is not proof that a publisher is broadcasting. The iframe checks advancing decoded frames; stopping display does not stop the publisher camera. VDO.Ninja push IDs are not authentication secrets, and WebRTC capacity and LINE LIFF playback require real-device/load tests.
