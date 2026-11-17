# LINE outbox payload freeze (I18N 6.1 C-FIX)

Migration `052_line_outbox_payload_snapshot.sql` adds nullable `payload_locale` and `payload_messages` JSONB columns to the five existing outboxes. No new notification type or LINE call is introduced. New outbox rows are snapshotted in the same event transaction. The first send reads the stored JSONB messages, so the first and all later attempts serialize the same HTTP body. The database trigger rejects changes to a stored payload, locale, or recipient.

| Member notification | Enqueue snapshot | Sender | LINE calls per eligible attempt, before → after |
| --- | --- | --- | --- |
| LIVE started | Both existing camera start paths | `dispatchLiveStartLine` | 2 quota GET + 1 push POST → same |
| Countdown started | Manual and automatic countdown | `dispatchCountdownLine` | 2 quota GET + 1 push POST → same |
| Round result | Verified settlement transaction | `dispatchRoundResultLine` | 2 quota GET + 1 push POST → same |
| Top-up approved | Approved-member enqueue transaction | `dispatchApprovedMemberLine` | 1 push POST → same |
| Withdrawal transferred/rejected | Withdrawal decision transaction | `dispatchWithdrawalLine` | 1 push POST → same |

The recipient and retry identity remain the existing outbox columns. A retry does not query member locale or render a template. When a member changes from Chinese to English after a 503, the old job keeps Chinese messages and the next event snapshots English messages. PostgreSQL integration tests compare complete push HTTP bodies and `X-Line-Retry-Key` before and after the change.

If a template cannot render at enqueue, that notification is retained with `payload_render_failed` and no LINE attempt. The LIVE, countdown, top-up, withdrawal, or settlement transaction can still complete; a failed notification cannot roll back the underlying event.

## Existing rows

An unattempted old row (`attempts=0`, no payload) is snapshotted under its claim lock before its first attempt. Its locale is the member's locale at that first claim, because the locale at original enqueue was not recorded. An old row with `attempts>0` and no payload cannot safely replay under its old retry key. Migration 052 retains the row, marks it `FAILED` (or `UNDELIVERABLE` for result), sets `attempts=5`, and records `payload_snapshot_review_required`. It is never marked `SENT`. Existing `SENT` rows remain untouched. Operators must review those retained rows against LINE provider evidence; no automatic replay or new retry key is created.

## Rollback

Do not drop the new columns to roll back: that would lose the snapshots. Keep migration 052 applied, turn off the notification worker, and restore the previous application version only after disabling its LINE dispatch paths. The previous version re-renders messages and must not resume dispatching these jobs. Reapply the fixed application or prepare a separate, reviewed data migration if a full rollback is required. No Production migration or rollback was performed in this task.

LINE's retry key handles an accepted 409 response, but the application cannot guarantee exactly-once delivery when the provider accepts a request and its response is lost. Mock tests establish local claim/idempotency behavior only.
