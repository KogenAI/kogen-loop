# Wait for the provider to accept connections

Slug: l-net-retry-stage
Model: not applicable — the change adds one bounded wait inside the existing 3-attempt retry loop, between an attempt that could not connect and the next attempt. The wait ends on a successful TCP connect, the existing absolute budget or cancellation. The attempt counter and every other rule are unchanged, so there are no new interacting states worth modelling.
Acceptance:
- .kogen/intents/l-net-retry-stage/acceptance.feature
- features/steps/l_net_retry_stage.js

Fix L-NET-RETRY-STAGE (change_type: fix; source of truth: Studio kogen-loop issue 268ae7b0-0dc6-4826-af6c-baf582d536f9). No new command, flag, option or setting. Raising attempt counts or timeouts is not a fix (owner rule). The need is that a brief network outage does not discard a stage's work.

**Problem (from the issue).** In 3 of 92 Kogen research cells on 1 Nov (one build stage, two shape stages), three transport failures in a row ended the stage within about 45 seconds. Example: attempts at 03:10:11.7Z, 03:10:13.7Z and 03:10:51.7Z, then `provider/unavailable: ChatGPT did not answer after 3 attempts: network error: dial tcp <gateway>:443: i/o timeout`. The whole stage's work was lost to a short connectivity gap.

**Today (code).** `provider/respond.go`, `(*run).attempts`, handles a failed connection like any other transient failure. `transportFailure` turns it into the detail `network error: <text>` (or `<Label> network failure` for key providers). The retry waits 2 s, then 8 s, and the third failure ends the logical call with `<Label> did not answer after 3 attempts: <detail>`. A single model request inside a round failing this way ends `loop.Run` with that error, and the round's in-memory conversation and its tool work are discarded. Reproduced by this shaping session against the real CLI: a round that had written `progress.txt` through a `write_file` call lost that work. Its next request was refused for 14 s, and the round ended after about 10 s with exit 1 and `ChatGPT did not answer after 3 attempts: network error: dial tcp 127.0.0.1:<port>: connect: connection refused`.

**Outcome.** A connection failure no longer spends the remaining attempts on an origin that cannot be reached. After the unchanged backoff, the run waits until the provider's origin accepts a TCP connection, and only then sends the next attempt. The wait sends no request and uses neither more attempts nor longer timeouts. It is bounded by the existing absolute response budget and by cancellation. So a short outage is waited out, and the round goes on with its conversation and completed work intact. Real provider errors and responses keep their current handling.

Of the two outcomes the request allows, this Intent picks waiting the outage out. It does not add a resumable stop: no per-request transcript or checkpoint, and no change to `loop/`, the session format or the CLI. Kogen, its vendored copy and its pin are not changed. The fix reaches Kogen only when Kogen updates its own vendored copy.

### Rules

These rules apply in the retrying mode (`(*run).attempts`) of every provider and every route: Responses (ChatGPT, SuperGrok), Chat Completions (OpenCode Go, openai-compatible) and Anthropic Messages.

1. **Connection failure.** An attempt is a connection failure when all of these hold:
   - Its HTTP exchange (`k.do` / `r.post`) returned an error. The caller's interrupt, the spent budget and the attempt's first-byte/idle timeout keep their current precedence in `transportFailure` and are not connection failures.
   - The error chain (`errors.As`, through `*url.Error`) contains a `*net.OpError` whose `Op` is `"dial"`.

   This covers connection refused, the dial i/o timeout of the default 30 s dialer, unreachable network or host, and a name lookup failure during the dial. In all of these, nothing reached the provider.

   Errors after a connection exists are not connection failures and keep today's handling exactly: TLS handshake failures, a reset or EOF before or during the answer, body read errors and cut streams.

   The failed attempt itself is unchanged:
   - it is transient, with the same detail text;
   - its attempt record is the same (outcome `failed`, error `provider_failure`, `end_reason` `transport`, no `provider_failure` diagnostics);
   - it counts as one of the 3 attempts.
2. **Wait for the origin.** When a connection failure is attempt 1 or 2:
   - First comes the existing backoff, unchanged: `(*call).pause` of 2 s after the first attempt and 8 s after the second. A connection failure has no Retry-After.
   - Then the run waits until the origin accepts a TCP connection, and only then sends the next attempt.

   The wait works like this:
   - **Probe.** One TCP connect (`net.Dialer`, network `tcp`) to the host and port of the origin the attempt was sent to (`(*call).origin()`: the `KOGEN_PROVIDER_URL` seam, the provider's API base, or the openai-compatible `base_url`). The port comes from the URL; without one it is 443 for `https` and 80 for `http`. A connected probe is closed at once without writing a byte. The probe sends no HTTP or TLS and uses no credentials. It uses its own dialer, not `Client.HTTP`.
   - **Each probe** is bounded by 5 s, by the call's remaining budget and by the call's context.
   - **After a failed probe**, the run calls `(*call).pause(1 * time.Second)` (which uses `Client.Sleep` and is clipped to the budget) and probes again.
   - **The first successful probe** ends the wait. The next attempt is sent at once, and the attempt number advances as today.
   - **What the wait is not.** It sends no request and emits no attempt record or event. It is not an attempt and not a retry.
   - **What else ends it.** Only two things:
     - the absolute response budget, with the existing expiry error (`<Label> response wait exceeded 30 minutes`, or the `Client.ResponseBudget` text such as `response wait exceeded 10s`);
     - the caller's cancellation, interruption or deadline, with the same errors as during the backoff pause today. The CLI's `deadline_seconds` gives `loop/deadline` with detail `the round did not end within N seconds`.
3. **The attempt count does not change.** There are at most 3 transport attempts:
   - A connection failure on attempt 3 ends the call as today with `<Label> did not answer after 3 attempts: <detail>`, and no wait follows it.
   - An origin that accepts the probe but refuses the next attempt again spends attempts as usual.
   - After the wait, every later failure is handled by the existing rules. For example, an origin that comes back answering HTTP 503 `Retry-After: 0` gets the 2 remaining attempts and ends with `ChatGPT did not answer after 3 attempts: HTTP 503 overloaded`.
4. **Unchanged:**
   - every other transient failure and its 2 s/8 s or Retry-After wait: HTTP 429/5xx, stream failure events, cut streams, the first-byte and idle timeouts (90 s / 45 s / 180 s), the visible-output limit;
   - refusals and provider errors (for example HTTP 400 → `ChatGPT refused the request: 400 bad request` after one attempt);
   - the 401 refresh, the unreadable-answer retry and the cache-key strip retry;
   - `Request.Single`: one attempt, and a connection failure still ends at once with `network error: <text>` and no wait;
   - credential refresh and login requests (`postForm`);
   - request bytes, attempt records, the default client's 30 s dial and TLS-handshake limits, and the 30-minute or `ResponseBudget` budget.
5. **Rounds keep their work.** Because `Respond` no longer ends during a short outage, `loop.Run` simply continues the round with its in-memory conversation (sent input, replayed items, tool outputs). Condensation requests behave the same way. Nothing in `loop/`, `api/` or `cmd/kogen-loop` changes.

### Documentation

- `docs/contract/loop-v1.md`, section "Client response budget": add a bullet next to the Retry-After bullet, stating:
  - what counts as a connection failure;
  - the backoff followed by the TCP reachability wait (direct TCP connect to the origin host and port; 1 s between probes; each probe at most 5 s; no request, record or credentials);
  - that the wait ends only on a connection, the absolute budget or cancellation;
  - that the attempt count is unchanged and that `Request.Single` is unchanged.

  Keep the L3 sentence true: the wait sends no request and adds no retry.
- `README.md`: add one sentence to the paragraph of fixed limits saying that an attempt that cannot connect is followed, after the usual backoff, by a wait for the origin to accept a TCP connection, within the response budget, with attempts staying three. Per the README, no CHANGELOG.md entry.

## Decisions
- A short network outage (connection refused or dial timeout before any response) does not end the stage and discard its progress (source: request)
- The outage is waited out by a means other than more attempts or longer timeouts; the attempt count and request timeouts stay unchanged (source: request)
- Real provider errors and responses keep their current handling (source: request)
- No new command, flag or option (source: request)

## Source comparison
- Need: a short outage does not end a stage and discard its progress. Addressed by rules 1, 2 and 5. Acceptance scenario "A refused-connection outage longer than the retry schedule is waited out and the round keeps its work" reproduces the reported loss: a round with completed tool work hits a 14 s refused-connection outage. Today it ends after about 10 s with `ChatGPT did not answer after 3 attempts: network error: dial tcp …: connect: connection refused`. With the fix it completes, keeping `progress.txt` and carrying call `call_1` and its output into the request sent after the outage.
- Need: the run waits the outage out "by a means other than more attempts or longer timeouts", or else stops resumably. Addressed by the reachability wait (rule 2), which is bounded by the existing budget and cancellation. The resumable-stop alternative is not chosen, so no transcript or checkpoint change.
- Owner rule: raising attempt counts or timeouts is not a fix. Addressed by rule 3 and the unchanged items in rule 4. Acceptance scenarios "Waiting adds no attempt…" (3 attempts, 2 of them HTTP, after the wait) and "An origin that never accepts a connection…" (one attempt record, then a wait until `deadline_seconds`).
- Need: real provider errors and responses keep their current handling. Addressed by rule 4. Acceptance scenarios "A provider that answers with a refusal still fails at once as today" and "A provider that answers with temporary errors still ends after 3 attempts as today, without waiting".
- Acceptance evidence: "a fake provider endpoint that refuses connections for a period and then answers: the run completes … and the attempt count and request timeouts are unchanged; a provider that answers with an error still fails as today". Covered by the five scenarios against the real CLI and a local fake Responses server, and by the Go tests below.
- Issue example (`dial tcp <gateway>:443: i/o timeout`, attempts at 03:10:11.7Z, 03:10:13.7Z, 03:10:51.7Z): dial timeouts are connection failures under rule 1. A real dial timeout cannot be produced deterministically on loopback, so the CLI acceptance uses connection refused, and a provider test injects a dial-timeout `*net.OpError` through `Client.HTTP`.
- Historical figures (3 of 92 cells, 1 Nov): kept as context only. Kogen, its vendored copy and its pin are out of scope.
- Superseded: the current behavior where a connection failure ends the call after 3 attempts within about 10 s (plus dial time). The existing tests that assert it are updated (see Tests).

## Tests
- A connection failure waits until the origin accepts a connection, then sends the next attempt: add `TestConnectionFailureWaitsForOrigin` in ./provider on Responses (ChatGPT), Chat Completions (OpenCode Go) and Messages (Anthropic). The fake origin's loopback port is closed (refused) for the first attempt and reopened on the same port from the fake `clock` Sleep after a few 1 s probe pauses. Expect a completed response, exactly one HTTP request at the server, attempt records [failed with `end_reason` `transport`, completed], and `slept()` equal to 2 s followed only by 1 s pauses (regression)
- A dial i/o timeout is a connection failure too: in the same test, a `Client.HTTP` transport whose dial returns a timeout `*net.OpError` (Op `dial`) while the origin port is closed gives the same wait-then-complete outcome (integration)
- A closed origin is waited for until the budget, not failed after 3 attempts: update `TestTransientNetworkFailureWithoutAnswer` (provider/respond_test.go) and `TestOpenCodeGoNetworkFailureIsTransientAndNamesNoAddress` (provider/chat_test.go). With a closed origin and `Client.ResponseBudget` of 10 s they now expect one attempt record, no HTTP request, the expiry error `ChatGPT response wait exceeded 10s` / `OpenCode Go response wait exceeded 10s`, and still no token or address in the error (regression)
- The attempt count stays three: add `TestConnectionFailureKeepsThreeAttempts` in ./provider. (a) The origin comes back answering 503 → 3 attempt records and `ChatGPT did not answer after 3 attempts: HTTP 503 …`. (b) An origin that accepts each probe but refuses each attempt → 3 attempt records and `ChatGPT did not answer after 3 attempts: network error: …connection refused`, with no wait after the third (integration)
- Failures after a connection exists keep today's handling: in ./provider, a fake origin that accepts the connection and closes it without an answer gives 3 attempts, `slept()` `[2s, 8s]` and `did not answer after 3 attempts: network error: …` (regression)
- `Request.Single` is unchanged: on ChatGPT with a closed origin, one attempt, an error detail starting `network error: `, and no sleep (unit)
- Cancellation during the wait: cancelling the context (or interrupting the session) while probes fail returns the same interrupt or context error as during the backoff pause, with no further attempt (integration)
- Through the real CLI, a refused-connection outage is waited out with the round's work kept, the attempt count stays three, an origin that never accepts is waited for until `deadline_seconds` without another attempt, and HTTP 400 and 503 answers fail exactly as today: acceptance.feature with step file `features/steps/l_net_retry_stage.js` (scenario)
- Unchanged retry, timeout and error behavior for answered requests: the existing provider tests (`TestThreeTransientFailuresStopWithBackoff`, retry-after, idle and output-limit tests) and the acceptance suites of earlier intents keep passing (existing)
- The contract and README describe the wait: inspect `docs/contract/loop-v1.md` and `README.md`, and run go-format, go-test, go-vet and go-build (existing)

## Feasibility
- These are scratch observations by this shaping session, not Kogen probe records. They used the real CLI built from caf3990 and a Node fake Responses server in a temporary directory.
  - Refusing connections for 12–14 s from the start, or after a first answered request: attempts at 0 s, 2 s and 10 s, then exit 1 with `ChatGPT did not answer after 3 attempts: network error: dial tcp 127.0.0.1:<port>: connect: connection refused`. Each failed attempt has `end_reason` `transport` and no `provider_failure`.
  - With a 1 s outage the round completes. The fixture's listener reopened on the same port and the second request carried `function_call` `call_1` with its `function_call_output`. `round.ended` had requests 2 and claim `done`.
  - With `deadline_seconds` 6 and an origin that never opens: `{"class":"loop","reason":"deadline","detail":"the round did not end within 6 seconds"}` after two attempt records.
  - 400: `ChatGPT refused the request: 400 bad request` after one attempt.
  - Three 503s with `Retry-After: 0`: `ChatGPT did not answer after 3 attempts: HTTP 503 overloaded` within 0.01 s.
- The drafted acceptance ran with the configured cucumber runner on the unchanged tree (28.5 s). Three scenarios fail with missing-feature red:
  - the outage scenario on exit code 1;
  - "Waiting adds no attempt" on attempts [transport, transport, http];
  - "never accepts" on two attempt records instead of one.

  The two provider-error scenarios pass; they are preserved behavior. A `--dry-run` with all existing step files reported no undefined or ambiguous steps.
- The assertions after those first failures were not reached on the unchanged tree. The observer controls below exercise them separately.
- Only two existing tests assert the replaced fast failure on a closed origin: `TestTransientNetworkFailureWithoutAnswer` and `TestOpenCodeGoNetworkFailureIsTransientAndNamesNoAddress`. No test fakes a `*net.OpError`. The `127.0.0.1:1` base URLs in other tests only render bodies or run the offline `capabilities` command.
- evidence: {"id":"net-retry-stage-observer","kind":"observer","inputs":["features/steps/l_net_retry_stage.js"],"observers":["features/steps/l_net_retry_stage.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/l_net_retry_stage.js --control good","exit":0,"output":"net-retry-stage observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/l_net_retry_stage.js --control bad","exit":1,"output":"net-retry-stage observer rejected\n"}]}
