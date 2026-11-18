# I18N 6/6 final acceptance (isolated dry run)

All values below come from `locales/*.json`, `lib/line/start-cards.ts`, `lib/line/game-notices.ts`, `lib/line/round-broadcast.ts`, `lib/topup/member-line-notify.ts`, `lib/withdrawal/line.ts`, and the member UI. `125`, `5.8756`, `100`, `190`, and `REQ-125` are test inputs, not member data. No LINE/WeChat request was made to a real provider.

| Type and source | ไทย | 中文 | EN | Result |
| --- | --- | --- | --- | --- |
| Start LIVE · LINE `line.live.title` | เริ่มถ่ายทอดสดแล้ว | 直播已开始 | LIVE has started | PASS, per recipient |
| Start countdown · LINE `line.countdown.title` | เริ่มนับถอยหลังแล้ว | 倒计时已开始 | Countdown has started | PASS, per recipient |
| One minute before close · OA Broadcast | 🔴 PAIR LIVE เหลือเวลาอีก 1 นาที! ระบบกำลังจะปิดรับการทายผล รีบเข้ามาทายผลก่อนหมดเวลา | NOT SUPPORTED | NOT SUPPORTED | Thai only; one broadcast request has one shared text |
| Result `5.8756` · LINE `line.result.number` | ผลตัวเลข: 5.8756 (คู่) | 结果：5.8756（双） | Result: 5.8756 (Even) | PASS, per recipient |
| Entry submitted · Web `member.entrySent` | ส่งรายการแล้ว · สถานะรอผล | 已提交 · 等待结果 | Submitted · Result pending | PASS Web; no separate LINE event |
| Entry failed · Web `member.error.entryFailed` | ส่งรายการไม่สำเร็จ | 提交失败 | Could not submit entry | PASS Web; LINE NOT SUPPORTED |
| Add points request · Web `member.topupSuccess` | รับคำขอเลขที่ REQ-125 แล้ว กรุณาส่งภาพสลิปในแชต LINE OA ให้แอดมินตรวจ พร้อมระบุเลขคำขอ | 已收到申请 REQ-125。请在 LINE OA 聊天中发送凭证图片和申请编号供管理员审核 | Request REQ-125 received. Send your receipt image and request number to the admin in LINE OA chat | PASS Web; request card to admin remains Thai |
| Add points approved · LINE `line.topup.approved` | ✅ เติมแต้มสำเร็จ 100 แต้ม | ✅ 已添加 100 积分 | ✅ 100 Points added | PASS, per recipient |
| Add points rejected · Web `member.topupRejectedStatus` | ปฏิเสธแล้ว | 已拒绝 | Rejected | PASS Web; member LINE notice NOT SUPPORTED |
| Withdraw request · Web `member.withdrawSuccess` | ส่งคำขอถอนแต้มเลขที่ REQ-125 แล้ว รอแอดมินตรวจและจ่ายแต้ม | 提取申请 REQ-125 已提交，等待管理员审核并发放积分 | Withdrawal request REQ-125 submitted. Wait for admin review and points transfer | PASS Web; admin LINE request card remains Thai |
| Withdraw approved · LINE `line.withdraw.transferred` | ✅ จ่ายแต้มแล้ว · 100 แต้ม · เลขคำขอ REQ-125 | ✅ 已发放积分 · 100 积分 · 申请编号 REQ-125 | ✅ Points paid · 100 Points · Request REQ-125 | PASS, per recipient |
| Withdraw rejected · LINE `line.withdraw.rejected` | ❌ คำขอถอน 100 แต้มถูกปฏิเสธ ยอดแต้มไม่เปลี่ยน · เลขคำขอ REQ-125 | ❌ 100 积分的提取申请被拒，积分余额未变 · 申请编号 REQ-125 | ❌ Withdrawal of 100 Points rejected; balance unchanged · Request REQ-125 | PASS, per recipient |
| Insufficient points · Web `wallet.insufficient` | แต้มไม่เพียงพอ | 积分不足 | Not enough points | PASS Web; LINE NOT SUPPORTED |
| Entries closed · Web `member.roundHistoryClosed` | ปิดรับรายการ | 已截止 | Entries closed | PASS Web; LINE closed-round event NOT SUPPORTED |
| Service paused · Owner `status.paused` | พักบริการ | 已暂停 | Paused | PASS Web; LINE NOT SUPPORTED |
| Service expired · Owner `status.expired` | หมดอายุ | 已到期 | Expired | PASS Web; LINE NOT SUPPORTED |
| Generic error · Web `member.error.generic` | เกิดข้อผิดพลาด | 发生错误 | An error occurred | PASS Web; generic LINE error NOT SUPPORTED |
| Admin add-points approval label · Web `admin.topup.approval` | อนุมัติเติมแต้ม | 添加积分审批 | Add points approval | PASS Web; admin LINE card remains Thai |

## Result rule and rendering

`lib/ocr/core.ts` extracts the final displayed character from the **string** and `lib/rounds/settlement.ts` uses `resultParity()` from `lib/line/game-notices.ts`. Both use the final digit without float conversion or rounding. The member history uses the stored `fullDisplayText`, `lastDigit`, and `parity` fields. API sides stay `even`/`odd`.

| Display | Last digit | ไทย | 中文 | EN |
| --- | --- | --- | --- | --- |
| 5.8756 | 6 | คู่ | 双 | Even |
| 5.8757 | 7 | คี่ | 单 | Odd |
| 0.0000 | 0 | คู่ | 双 | Even |
| 9.9999 | 9 | คี่ | 单 | Odd |

LINE Flex card dry run with `roundId=125`, `resultNumber=5.8756`, `stakePoints=100`, `creditedPoints=190` renders the following exact lines:

```text
ไทย: ผลตัวเลข: 5.8756 (คู่) · แต้มที่ได้รับรวมทุน: 190 แต้ม
中文: 结果：5.8756（双） · 获得积分（含本金）：190 积分
EN: Result: 5.8756 (Even) · Points credited including stake: 190 Points
```

## Database and delivery checks

An isolated PostgreSQL 18 Docker database named `pair_live_migration_test` received all migrations through 051. Two preexisting synthetic members were inserted before reapplying 051; both defaulted to Thai. An authenticated member A changed to Chinese and English via `/api/member/language`; member B remained Thai even when A supplied B's ID in the request body. Invalid locale returned 400 and foreign Origin returned 403. Removing the two new columns left both members, identities, and sessions intact. This rollback loses saved language choices and requires reverting application code before use. No Production database was accessed.

The existing settlement integration test used mock LINE HTTP responses: Chinese winner and English loser received the correct language, number, points, and stable retry keys, with no extra delivery after `SENT`. Countdown, top-up, and withdrawal PostgreSQL integration tests passed with mock provider responses. One SQL ambiguity in the result Outbox claim query was found and fixed during this acceptance pass.

## Limits

- OA-wide closing broadcast is Thai because one LINE broadcast request has one shared message. Per-member translation would require a separate delivery design and potentially more API calls.
- There is no separate closed-round LINE event or rejected-top-up member LINE event in the current system.
- Admin LINE cards stay Thai because no trusted admin notification locale is stored.
- A trusted LINE LIFF language has not been stored server-side. Explicit member choice takes precedence; existing members otherwise use Thai.
- WeChat Chinese templates are render-only; no WeChat delivery was enabled.
- Browser QA uses mocked APIs, not live LINE login, camera, wallet, or Production data.

## Final QA results

- Automated suite: 251 tests, 220 PASS, 0 FAIL, 31 SKIP without optional PostgreSQL URLs.
- Isolated PostgreSQL: Migration 051 installation/default/update/session/isolation/rollback PASS; targeted settlement, countdown, top-up, withdrawal, member-session, and migration tests PASS with mock LINE HTTP responses.
- TypeScript and production build: PASS.
- Browser with mocked APIs: Member, Admin, Owner in Thai/Chinese/English at 360px, 390px, and 1280px had zero document overflow. Language switching and refresh persistence passed. Member Even button remained selectable. Screenshots are saved outside the repository at `/workspace/work/i18n-final-qa/{member,admin,owner}-{th,zh,en}-390.png`.
- Live LINE/WeChat delivery, actual LIFF login, real camera, real wallet transactions, and Production environment: NOT TESTED. No real messages or transactions were sent.

**Acceptance: NOT READY for release.** Remaining unsupported message types and Thai-only broadcast/admin cards are listed above. This branch remains a draft; no merge, deployment, or Production migration was performed.
