# I18N 6.1 B/4 — LINE Card number and result safety

The source mapping below was read from the actual Outbox dispatch and renderer code. Automated examples use synthetic values only. No OCR, Settlement, Wallet, Ledger, database schema, migration, or LINE API call was changed in this task.

| Data | Actual source → Card | Meaning |
| --- | --- | --- |
| Result number and parity | `rounds.result_number` → `lib/line/round-result-notify.ts` → `resultNoticeCard`; `lib/rounds/settlement.ts` uses `resultParity()` on the final character of the result **string** | Displayed number and even/odd result. No Float conversion or rounding |
| Stake | `round_entries.demo_points` → `state.demo_points` → `stakePoints` | Points entered for that selection |
| Award | `round_settlement_awards.credited_points` with matching Wallet/legacy ledger → `creditedPoints` | Points credited for that round, including stake when correct. **Not wallet balance** |
| Add-points request | `member_topup_requests.requested_points`, `id`, `created_at`, `members.display_name` → `lib/topup/line-notify.ts` → `requestCard` | Requested points, full request ID, original member name, creation instant |
| Withdrawal request/status | `member_withdrawal_requests.requested_points`, `id`, `payout_details`, `members.display_name` → `lib/withdrawal/line.ts` | Requested points, full request ID, original receiving details and member name |
| Countdown | `rounds.countdown_ends_at - countdown_started_at`, extracted as integer seconds → `countdownStartCard` | Configured countdown seconds, not a locally guessed timer |
| LIVE | `live_start_line_events.shop_name` → `liveStartCard` | Stored shop name; no numeric result |

The accepted result strings and actual displayed suffixes are:

| Result string | Last digit | ไทย | 中文 | EN |
| --- | --- | --- | --- | --- |
| 5.8756 | 6 | คู่ | 双 | Even |
| 5.8757 | 7 | คี่ | 单 | Odd |
| 0.0000 | 0 | คู่ | 双 | Even |
| 9.9999 | 9 | คี่ | 单 | Odd |

These examples were rendered by the real card functions with synthetic round `125`, request `11111111-1111-4111-8111-111111111111`, stake/request 100 Points, and confirmed round credit 190 Points. Full text for all 12 variants in all three locales is in [line-fixed-card-examples.md](line-fixed-card-examples.md).

| Card data | ไทย | 中文 | EN |
| --- | --- | --- | --- |
| Winning number | ผลตัวเลข: 5.8756 (คู่) | 结果：5.8756（双） | Result: 5.8756 (Even) |
| Stake | จำนวนที่ทาย: 100 แต้ม | 投注：100 积分 | Stake: 100 Points |
| Credited round award | รวมแต้มที่ได้รับจากรอบนี้: 190 แต้ม | 本轮获得积分合计：190 积分 | Total credited this round: 190 Points |
| Losing award | แต้มที่ได้รับ: 0 แต้ม | 获得积分：0 积分 | Points credited: 0 Points |
| Add-points request | แต้มที่ขอเติม / 100 แต้ม | 申请添加积分 / 100 积分 | Points requested / 100 Points |
| Withdrawal request | ถอน: 100 แต้ม | 提取：100 积分 | Withdraw: 100 Points |
| Countdown | เวลานับถอยหลัง: 60 วินาที | 倒计时：60 秒 | Countdown: 60 seconds |

Regression tests render 12 variants × 3 locales and verify required numbers, full request IDs, original names/details, identical card structure and postback data, matching rendered dates for the same instant, no unresolved placeholders, and stable rendering for identical retry inputs. Invalid status, malformed number, nonpositive/fractional points, and numbers exceeding `Number.MAX_SAFE_INTEGER` are rejected by the renderer rather than presented as another result.

Isolated PostgreSQL integration tests for Settlement/Outbox retry, Topup, and Withdrawal used mock LINE HTTP responses. They verify that the result body and retry key stay stable for the same recipient, accepted delivery is not repeated, and the localized card is addressed to the matching recipient. Live camera/OCR and real provider delivery were not tested. Admin card sending still defaults to Thai until a trusted admin notification locale exists.

During this pass, an older Withdrawal PostgreSQL test still asserted the prior Thai status wording; it was updated to the fixed template wording. The result-card total line was changed from an ambiguous total to **points credited this round** in all three languages. No accounting calculation changed.
