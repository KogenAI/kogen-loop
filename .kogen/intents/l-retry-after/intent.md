# Wait for Retry-After before provider retries

Slug: l-retry-after
Model: not applicable — the change only selects the length of each wait inside the existing bounded 3-attempt retry loop, or ends that loop early; it adds no new state or interacting rules.
Acceptance:
- .kogen/intents/l-retry-after/acceptance.feature
- features/steps/l_retry_after.js

Fix L-RETRY-AFTER (change_type: fix; Studio kogen-loop issue ceea2e8b, filed by research 31 Oct 2026). Today (`provider/respond.go`, `(*run).attempts`) every transient attempt failure is retried after a fixed 2 s, then 8 s, whatever the provider says. On HTTP 429 with `Retry-After: 30` all three attempts are spent within about 10 s and the call fails with `provider/unavailable`. This was reproduced by this shaping session against the real CLI and a local fake Responses server on 3c15c7b. With `Retry-After: 3` the second request came 2.0 s after the first. With three header-less 429s the waits were 2.0 s and 8.0 s, then exit 1 and the error event `{"class":"provider","reason":"unavailable","detail":"ChatGPT did not answer after 3 attempts: HTTP 429 rate limited"}` 10.0 s after the first request. The issue reports the same defect on kogen-loop main 733b50d and in the copy vendored in Kogen 3e759e88. This change touches only this repository: not Kogen, its vendored copy or its pin.

No new command, flag, option or setting. The bound is fixed.

Technical choices made in shaping (not UI/UX):
- The fixed bound is 60 s, inclusive, so the issue's `Retry-After: 30` is waited.
- Both RFC 9110 forms are accepted, and anything else counts as absent.
- The advertised wait is used exactly, even below 2 s.
- The rule applies on all three HTTP routes.
- The reason stays `provider/unavailable`, with the detail format in rule 4.

### Rules

These rules apply in the retrying mode (`attempts`) of every provider route that reads an HTTP status:
- Responses (`exchangeResponses` / `httpFailure`: ChatGPT, SuperGrok)
- Chat Completions (`exchangeChat`: OpenCode Go, openai-compatible)
- Anthropic Messages (`exchangeMessages` / `messagesFailure`)

1. **Usable Retry-After.** An attempt has a usable Retry-After only when all of these hold:
   - Its HTTP response status is exactly 429 or 503.
   - The response carries a `Retry-After` header. Use its first value (`Header.Get`), trimmed of surrounding spaces and tabs.
   - That value is one of the two forms RFC 9110 defines:
     - delay-seconds: one or more ASCII digits. The advertised wait is that many seconds; leading zeros are allowed, so `003` is 3 s and `0` is 0 s.
     - an HTTP-date: anything `net/http.ParseTime` accepts (IMF-fixdate, RFC 850, asctime). The advertised wait is that time minus `Client.Now()`, or 0 when the date is not in the future.

   Any other value has no usable Retry-After: empty, negative, fractional (`1.5`), text, or an unparsable date. Other statuses carrying the header have none either (500, 502, 504, 401, 4xx refusals), and neither does a stream failure event inside a 200 response. Other headers are not read (`retry-after-ms`, `x-ratelimit-*`).

2. **Wait for the advertised time.** When a transient failure is retried (attempt 1 or 2) and it has a usable Retry-After of at most 60 s, the wait before the next attempt is exactly the advertised wait. This replaces the 2 s or 8 s for that wait, whether the advertised wait is longer or shorter: `0` retries at once, `1` waits 1 s, `3` waits 3 s, `60` waits 60 s. The wait uses the existing `(*call).pause`. It still counts against the call's absolute response budget: it is clipped to the remaining budget and ends with the existing expiry error. Caller cancellation still interrupts it.

3. **No usable header keeps the schedule.** Without a usable Retry-After the wait is unchanged: 2 s after the first attempt, 8 s after the second. The position counts, whatever an earlier wait was. For example, `429 Retry-After: 3` then `429` without the header waits 3 s, then 8 s.

4. **Above the 60 s bound, fail at once.** The fixed maximum is 60 s, inclusive. Add it as an unexported constant in `provider/`. When a transient failure that would be retried (attempt 1 or 2) has a usable Retry-After whose advertised wait is above 60 s, the call fails at once: no pause and no further request. The error is `*sys.Error` with class `provider`, reason `unavailable` and exit 4, carrying the attempt's diagnostics (`withDiagnostics(..., res.diag)`) as the exhaustion error does. Its detail is exactly:

   `<Label> asked to wait <N> s before retrying, more than the 60 s limit: <attempt detail>`

   - `<Label>` is the provider label (`ChatGPT`, `SuperGrok`, `OpenCode Go`, `Anthropic`, `OpenAI-compatible`).
   - `<attempt detail>` is the transient result's existing detail, the same text that follows `did not answer after 3 attempts: `.
   - `<N>` for delay-seconds is the header's digits with leading zeros removed, kept as text so a value too large for an integer is never parsed into one. For an HTTP-date it is the advertised wait rounded up to whole seconds.

   Example on ChatGPT, through the CLI: a 429 with `Retry-After: 61` and body `{"error":{"message":"rate limited"}}` ends after one request with exit 1 and the error event `{"class":"provider","reason":"unavailable","detail":"ChatGPT asked to wait 61 s before retrying, more than the 60 s limit: HTTP 429 rate limited"}`.

5. **The attempt count does not change.** There are at most 3 transport attempts. The third transient failure ends, as today, with `<Label> did not answer after 3 attempts: <attempt detail>`, whatever Retry-After it carries, because no wait follows it. These stay unchanged:
   - the unreadable-answer retry, the 401 refresh and the cache-key strip retry, which have no wait;
   - `Request.Single` single-shot ChatGPT attempts (no retry, unchanged errors);
   - attempt records, request bytes, the silence limits and the 30-minute budget.

### Documentation

- `docs/contract/loop-v1.md`:
  - The "Client response budget" section mentions the 2 s/8 s backoff. Add the Retry-After rule beside it: the forms, 429/503 only, exact advertised wait, the inclusive 60 s bound, the immediate failure and its detail, and the unchanged attempt count.
  - Keep the L3 sentence true: no extra retries.
- `CHANGELOG.md`: add one v0.1.0 (unreleased) entry for L-RETRY-AFTER.

## Decisions
- A 429 or 503 carrying Retry-After waits the advertised time before the next attempt, bounded by a fixed maximum (source: request)
- Without the header the current 2 s / 8 s schedule stays (source: request)
- A Retry-After beyond the bound fails at once with a reason naming the advertised wait (source: request)
- The number of attempts does not change; no new command, flag or option (source: request)

## Source comparison
- Need 1, a 429 or 503 with Retry-After waits the advertised time, bounded by a fixed maximum: addressed by rules 1, 2 and 4. Acceptance scenarios "A 429 with Retry-After 3…", "A 503 with Retry-After 3…" and "A Retry-After of exactly 60 s…".
- Need 2, without the header the 2 s / 8 s schedule stays: addressed by rule 3. Acceptance scenario "Without Retry-After…" reproduces fixture h429x3: waits of 2 s then 8 s, then `provider/unavailable` at about 10 s.
- Need 3, beyond the bound fails at once with a reason naming the advertised wait: addressed by rule 4. Acceptance scenario "A Retry-After above the 60 s bound…".
- Need 4, the number of attempts does not change: addressed by rule 5. Acceptance scenario "Advertised waits are honoured on every retry and the attempt count stays three".
- Acceptance evidence (`Retry-After: 3` honoured at about 3 s, not 2 s; no header keeps 2 s / 8 s; above the bound fails at once with that reason): all three are reproduced against a local fake provider (`KOGEN_PROVIDER_URL`) through the real CLI.
- Evidence fixture h429_ra (`Retry-After: 30` retried at 2.0 s): covered by the same rule with `3` in acceptance, to keep the run short. The value 30 is within the 60 s bound.
- The external reproduction pack (kogen-bench `reproduce/loop-stream-shell-fault-fixtures`, `go run ./fakeprov`, `run_fixtures.py`) was not fetched or run. Its observations are taken from the issue text and match this session's local reproduction.
- Superseded: "2 s then 8 s waits" as an unconditional rule, in the `attempts` comment and in the contract.

## Tests
- A usable delay-seconds Retry-After on 429 and on 503 is waited exactly instead of the schedule, on Responses (ChatGPT), Chat Completions (OpenCode Go) and Messages (Anthropic): add `TestRetryAfterWaits` in ./provider with the existing fake servers and the `clock` fake (`slept()` equals `[3s]`, two requests, completed response), including `0` (retry at once), `003` (3 s) and a 429 `Retry-After: 3` followed by a header-less 429 (`[3s, 8s]`) (regression)
- No usable header keeps 2 s / 8 s: in `TestRetryAfterWaits` the header is absent, empty, `-1`, `1.5` or `soon`, or comes on a 500 or 502, and each case gives `slept()` equal to `[2s, 8s]` and three requests ending `did not answer after 3 attempts`; the existing tests that assert `[2s, 8s]` without the header keep passing unchanged (unit)
- Bound boundary: add `TestRetryAfterBound` in ./provider where, on 429 and 503, `Retry-After: 60` waits 60 s and the retry is sent, while `61` and `99999999999999999999` fail at once with one request, no sleep, reason `unavailable`, the exact detail of rule 4 (for example `ChatGPT asked to wait 61 s before retrying, more than the 60 s limit: HTTP 429 rate limited`) and the attempt's provider_failure diagnostics (regression)
- HTTP-date form: add `TestRetryAfterDate` in ./provider where, with the fake `Client.Now`, a date 5 s ahead waits 5 s, a past date waits 0 and a date 90 s ahead fails at once with `asked to wait 90 s` (unit)
- Attempts stay three: add to `TestRetryAfterBound` that three 429s with `Retry-After: 1` give three requests, `slept()` `[1s, 1s]` and `did not answer after 3 attempts`; a third attempt with `Retry-After: 120` still ends with the exhaustion message; an advertised wait longer than the remaining `ResponseBudget` ends with the existing expiry error; and `Request.Single` with `Retry-After: 3` still makes one request with an unchanged error (integration)
- The real CLI honours Retry-After against a local fake Responses server: acceptance.feature with step file `features/steps/l_retry_after.js` covers 429 and 503 `Retry-After: 3` retried after at least 2.9 s, the header-less 2 s / 8 s schedule with the exact exhaustion error, `Retry-After: 1` on every answer keeping three attempts, `61` failing within 1.5 s with the exact error, and `60` still waiting after 4 s with one request (scenario)
- Contract and changelog describe the rule: inspect `docs/contract/loop-v1.md` and `CHANGELOG.md`, and run go-format, go-test, go-vet and go-build (existing)

## Feasibility
- Scratch observations by this shaping session, using the real CLI built from 3c15c7b and a Node fake Responses server in a temporary directory (not Kogen probe records): `[429 Retry-After: 3, 200]` gave a second request after 2.004 s and exit 0; `[429, 429, 429]` gave waits of 2.005 s and 8.004 s, exit 1 and the error event detail `ChatGPT did not answer after 3 attempts: HTTP 429 rate limited` at 10.01 s; `[429 Retry-After: 60, …]` stopped with SIGTERM 3 s after the first request gave two requests and exit 143.
- The drafted acceptance ran with the configured cucumber runner on an unchanged copy of the tree (29 s). Five scenarios fail with missing-feature red: waits of 2.0 s where 3 s or 1 s is advertised, and a second request after `Retry-After: 61` and `60`. The header-less schedule scenario passes; it is preserved behavior.
- The error-detail assertions after those failures were not reached on the unchanged tree. The observer controls below exercise them separately.
- No existing test or fixture in the repository sends a Retry-After header, so no existing test asserts the old behavior for it.
- Documentation: a lookup of RFC 9110 §10.2.3 (rfc-editor.org) was denied in this session and returned no body. The two Retry-After forms, HTTP-date or delay-seconds (1*DIGIT), are stated from RFC 9110 as known to the shaper. The accepted date formats come from the local `go doc net/http.ParseTime`: "the three formats allowed by HTTP/1.1: TimeFormat, time.RFC850, and time.ANSIC".
- evidence: {"id":"retry-after-observer","kind":"observer","inputs":["features/steps/l_retry_after.js"],"observers":["features/steps/l_retry_after.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/l_retry_after.js --control good","exit":0,"output":"retry-after observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/l_retry_after.js --control bad","exit":1,"output":"retry-after observer rejected\n"}]}
