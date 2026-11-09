# V14.5 request budget

These are deterministic ten-minute **polling budgets**, verified by the fake-timer scheduler test. They are not a browser network trace or Neon telemetry. Initial login, wallet, history, entry submission, manual refresh and tab returns are excluded. Each member page has two backup status requests: `/api/round/current` and `/api/live`.

| Scenario | Prior 3s round + 4s LIVE | V14.5 idle (60s each) | V14.5 active (25s each) |
| --- | ---: | ---: | ---: |
| 1 member, 10 min | 352 | 22 | 50 |
| 20 members, 10 min | 7,040 | 440 | 1,000 |
| 50 members, 10 min | 17,600 | 1,100 | 2,500 |

Both columns include the initial request for each endpoint. The background tab makes **zero scheduled polls** while hidden, then refreshes on return. A successful entry also triggers an immediate round and LIVE status refresh; a manual refresh button does the same. Without a push channel, a new round or LIVE can appear up to approximately 60 seconds late while idle and 25 seconds late while active. Server time still determines the countdown and the server checks deadlines for every entry.

One API request is not one Neon query. `/api/round/current` and `/api/live` execute multiple authenticated database reads, so exact Neon query counts and costs require database telemetry or instrumentation in an isolated environment. Member `/api/live` does not call VDO.Ninja `getDetails`; the admin status path does and is now polled at 25/60 seconds while its tab is visible. The VDO video and viewer frame checks remain peer-to-peer in the browser, outside Vercel API polling.
