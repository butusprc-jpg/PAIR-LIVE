# I18N 6.1 D/4 final acceptance — isolated QA

Baseline: `491a86a` on `feat/pair-live-i18n-th-zh-en`, Draft PR #20. During acceptance, the branch also received `9da6c28` and `b6bc429` for member navigation and mobile language control, plus `199c798` through `ba10f75` for Admin camera and round controls. UI QA was repeated on top of these commits. The branch differs from `main` in 87 files: translation catalogs, UI presentation, member language persistence, LINE presentation/delivery, migrations 051/052, tests, and documentation. No wallet/ledger or OCR engine file, LINE credentials, worker schedule, or payout formula changed. The settlement module only calls `snapshotResult` after its existing result update.

GitHub reported the PR open, draft, and unmerged. The combined commit status list was empty at baseline; existing workflows target `main` or other feature branches, so **CI is NOT VERIFIED**; local tests are reported separately. The final head should be rechecked after this report is pushed.

## Fixed Flex Cards

All 12 card variants were rendered for `th`, `zh-CN`, and `en` by `tests/line-fixed-card-templates.test.ts`, using synthetic round `125`, shop `QA Shop`, member `QA Member`, result `5.8756`/`5.8757`, stake `100`, credit `190`, and a synthetic request UUID. The complete 36-row table of actual alt text, each rendered line, buttons, and request values is in [line-fixed-card-examples.md](line-fixed-card-examples.md). All variants preserve the same structure and postback data across languages; no placeholder or promotional line was found. Admin deliveries remain Thai, despite the renderer supporting three language previews.

| Variant | Thai alt text | Chinese alt text | English alt text |
| --- | --- | --- | --- |
| LIVE start | เริ่มถ่ายทอดสดแล้ว | 直播已开始 | LIVE has started |
| Countdown | เริ่มนับถอยหลังแล้ว | 倒计时已开始 | Countdown has started |
| Result correct | ทายถูก รอบ 125 | 猜中 第 125 轮 | correct, round 125 |
| Result incorrect | ทายผิด รอบ 125 | 未猜中 第 125 轮 | incorrect, round 125 |
| Top-up request | แจ้งคำขอเติมแต้ม | 收到添加积分申请 | Points request received |
| Top-up confirm approval | ยืนยันการเติมแต้ม | 确认添加积分 | Confirm points addition |
| Top-up confirm rejection | ยืนยันการปฏิเสธ | 确认拒绝申请 | Confirm rejection |
| Top-up approved status | อนุมัติเติมแต้มแล้ว | 已批准添加积分 | Points request approved |
| Top-up rejected status | ปฏิเสธคำขอเติมแต้มแล้ว | 已拒绝添加积分申请 | Points request rejected |
| Withdrawal request | ขอถอน 100 แต้ม | 申请提取 100 积分 | Withdraw 100 Points |
| Withdrawal transferred status | ถอนแต้ม: จ่ายแต้มเรียบร้อยแล้ว | 提取积分：积分已发放 | Points withdrawal: Points transferred |
| Withdrawal rejected status | ถอนแต้ม: ปฏิเสธคำขอแล้ว | 提取积分：申请已拒绝 | Points withdrawal: Request rejected |

The table abbreviates the common `PAIR LIVE` prefix and variable suffixes; the linked 36-row table contains complete rendered values. The four result strings `5.8756`, `5.8757`, `0.0000`, and `9.9999` yield final digits `6`, `7`, `0`, and `9`, matching Even/Odd in OCR string parsing, settlement presentation, member history translation, and LINE rendering unit tests. `190` is labeled **credited this round, including stake**, never wallet balance. The isolated settlement integration verifies a real settled row and outbox for `2.48`; it does not run all four listed result strings through a complete live camera/settlement path.

## PostgreSQL 18.7 and old outbox migration

All registered migrations 001–052 applied in order to an isolated `pair_live_migration_test` database. A member created before 051 received default `th`; changing that member to `zh-CN` left a second member at `th`. The API source scopes writes to the authenticated member ID. No Production database was queried.

The following synthetic old rows were inserted before 052. Values are status counts; each table retained its total and its SENT count. `SENDING`/`PROCESSING` rows with earlier attempts and no payload were quarantined, not delivered.

| Outbox | Before 052 | After 052 |
| --- | --- | --- |
| LIVE | PENDING 1, FAILED 1, SENDING 1, SENT 1 | PENDING 1, FAILED 2, SENT 1 |
| Countdown | PENDING 1, FAILED 1, SENDING 1, SENT 1 | PENDING 1, FAILED 2, SENT 1 |
| Result | PENDING 1, FAILED 1, SENDING 1, SENT 1, UNDELIVERABLE 1 | PENDING 1, SENT 1, UNDELIVERABLE 3 |
| Approved top-up | PENDING 1, RETRY 1, PROCESSING 1, SENT 1, FAILED 1 | PENDING 1, SENT 1, FAILED 3 |
| Withdrawal | PENDING 1, RETRY 2 (one admin), PROCESSING 1, SENT 1, FAILED 1 | PENDING 1, RETRY 1 (admin), SENT 1, FAILED 3 |

Each of the five tables has two old attempted member jobs retained with `payload_snapshot_review_required`, `attempts=5`, and no snapshot. The original result `UNDELIVERABLE` reason and the admin withdrawal retry remained unchanged. An unattempted old LIVE row was snapshotted under its claim lock before the first send. The other four lazy first-attempt paths are implemented and covered by source review, but not by a dedicated old-row integration fixture for each path. No row was deleted or marked SENT by migration 052.

## Retry and API calls

Isolated PostgreSQL + LINE HTTP mocks passed for all five member senders: complete HTTP body, recipient, and retry key remained equal after changing the member locale between failure and retry. Mock 429, 503, timeout, concurrent claims, reconnecting with a fresh database pool, and no resend after SENT were exercised. `payload_messages` and `payload_locale` become immutable once stored. A rendering failure leaves the notification for review without rolling back the underlying event. No real LINE/WeChat message was sent.

| Event | Baseline calls per eligible attempt | Current calls |
| --- | --- | --- |
| LIVE / Countdown / Result | 2 quota GET + 1 push POST | Same |
| Top-up approved / Withdrawal result | 1 push POST | Same |
| Closing broadcast | 2 quota GET + 1 broadcast POST | Same; Thai only |

LINE acceptance with a lost response still cannot be claimed exactly once. The stored retry key and payload make subsequent attempts stable, while provider-side behavior remains to be checked in live QA.

## UI, original systems, and release limits

Local Playwright with mocked API data checked Member and Admin/Owner login surfaces in three languages at 360px, 390px, and 1280px: 27/27 had the selected language after load and refresh and no document overflow. Member switched Chinese → English → Thai without reload and retained Thai on refresh. Authenticated Admin camera/settings surfaces passed another 9/9 checks: one preview, exactly two compact round buttons below it, one camera settings form, and no document overflow. Authenticated Owner OA list passed 9/9 checks with a synthetic OA, refresh persistence, and no document overflow. Screenshots from the earlier 6/6 QA are at `/workspace/work/i18n-final-qa/`. No real camera, transaction control, or account was used. Unit and integration tests cover Wallet/Ledger, top-up/withdrawal, settlement, OCR, LIVE, auth, owner control, and worker scheduling only to the extent of their synthetic fixtures; Production behavior was not tested.

The connected Railway account exposes staging and preview, with no Production project. Read-only staging inventory shows Web from `main`, Round Worker from `feat/pair-live-v16-1-real-camera-ocr`, and no staged changes. Production migration version, pending outbox counts, Web/Worker versions, backup state, and restore readiness are **NOT VERIFIED**. No Worker was stopped, no deployment was started, and no database outside the isolated test container was changed.

Before any later rollout: verify a restorable backup; read outbox counts and old attempted rows; stop notification/round workers; install 051 then 052 with the matching Web/Worker release; smoke-test language and one frozen mock or controlled LINE job; review quarantined rows; then resume workers. Rollback must preserve the 052 snapshot columns and stop old application dispatchers, as described in [line-outbox-payload-freeze.md](line-outbox-payload-freeze.md).

**Decision: READY FOR LIVE QA in an isolated, explicitly authorized environment. NOT READY FOR PRODUCTION.** CI, Production inventory/backup, real LIFF/LINE delivery, live camera, Admin/Owner mutations, and real transaction smoke tests remain unverified.
