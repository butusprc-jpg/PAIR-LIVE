# LINE delivery and outbox audit (I18N 6.1 C/4)

Baseline: `b2ac861`. This audit uses the existing senders and synthetic HTTP responses; it does not contact LINE.

| Event | Recipient and source | Baseline LINE calls per attempt | Current LINE calls per attempt |
| --- | --- | --- | --- |
| LIVE started | Eligible member from `live_start_line_outbox` | 2 quota GET + 1 push POST | Same |
| Countdown started | Opted-in member from `round_countdown_line_outbox` | 2 quota GET + 1 push POST | Same |
| Round result | Settled entry's member from `round_result_line_outbox` | 2 quota GET + 1 push POST | Same |
| Top-up requested | Verified admin recipient from `member_topup_line_notifications` | 1 push POST | Same |
| Top-up approved | Request member from `member_topup_member_notifications` | 1 push POST | Same |
| Withdrawal requested | Verified admin recipient from `member_withdrawal_line_outbox` | 1 push POST | Same |
| Withdrawal transferred/rejected | Request member from `member_withdrawal_line_outbox` | 1 push POST | Same |
| Closing broadcast | OA audience, Thai text | 2 quota GET + 1 broadcast POST | Same |

The quota GETs are skipped if the sender exits before delivery, and the POST is skipped when the quota check rejects it. A retry is another attempt under the existing retry policy. Admin replies to top-up and withdrawal postbacks also use one push POST per reply, unchanged. There are no promotional events. No translation lookup calls LINE.

The member senders render fixed catalog text using `members.notification_locale` at dispatch time; missing or invalid locale falls back to Thai. Admin cards and the closing broadcast remain Thai. `pushLine` preserves the recipient and derives the same `X-Line-Retry-Key` from the outbox ID; the broadcast uses its stored retry key. Outbox uniqueness and `FOR UPDATE SKIP LOCKED` prevent duplicate claims during normal concurrent dispatch. `SENT` rows are excluded from later claims. A 409 accepted response is treated as delivered. An unknown provider outcome cannot guarantee exactly-once delivery if LINE accepted a request but its response was lost.

## Acceptance blocker: locale change during retry

All five member outboxes store the recipient and retry identity but **no locale or rendered payload**. `live-start-notify.ts`, `countdown-notify.ts`, `round-result-notify.ts`, `topup/member-line-notify.ts`, and `withdrawal/line.ts` join or query the mutable `members.notification_locale` on each attempt. For example, a failed result push rendered in Chinese, followed by a member change to English, retries the same outbox entry and retry key with an English body. Thus the pending payload is not frozen. This violates the requested retry invariant and can conflict with LINE retry-key semantics. The current task prohibits schema/migration or risky outbox design changes, so this audit does not attempt a partial fix. A follow-up needs to persist the locale or complete payload when the job is created, with tests that change locale between 503 and retry for every member sender.

The existing PostgreSQL integration tests cover settlement idempotency, simultaneous result dispatchers, stable keys and bodies when locale stays fixed, 429/503, top-up and withdrawal request replay, and terminal `SENT` behavior. They do not establish the locale-change invariant, provider-side exactly-once delivery after a lost response, or a production worker restart. Tests use isolated data and HTTP mocks only.
