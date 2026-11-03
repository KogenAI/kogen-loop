# Record each attempt's request offset and host load

Slug: l-attempt-gap-load
Model: not applicable — two values are read when each transport attempt starts and written into that attempt's existing record; retries, waits, budgets, requests and results are unchanged, and nothing new is stored or carried between attempts or requests
Acceptance:
- .kogen/intents/l-attempt-gap-load/acceptance.feature
- features/steps/l_attempt_gap_load.js

L-ATTEMPT-GAP-LOAD (research shelf batch 3, Nov 2026; repository kogen-loop).

Problem today: the provider attempt record does not say when the attempt began relative to its request, or what the host was doing. That record is the map `provider/respond.go` `record()` passes to every `provider.Observer`; the CLI and `loop.Session` emit it as the `record` of each `request.attempt` event. So a long gap cannot be attributed to the loop, the host or the provider. Such gaps are the one between a request's start and its first attempt, or between two attempts.

After this change every attempt record carries exactly two more keys:
- `request_offset_ms`: a JSON integer, the whole milliseconds from the request start to this attempt's start.
  - Computed as `attemptStart.Sub(requestStart).Milliseconds()`, using the `Client.Now` clock (`c.now()`), like `wall_ms`.
  - The request start is the instant `Client.Respond` begins the logical call: the `c.now()` reading from which the call's response budget is counted (today taken in `newCall`). It is read once per `Respond` call and is the same value for every attempt of that call.
  - The attempt start is the existing `start` of `(*run).transport`, the same instant whose text is the record's `timestamp`.
  - So everything between the request start and the first attempt counts in the first attempt's offset, for example a credential refresh. Each later attempt's offset includes the earlier attempts, the backoff or `Retry-After` waits and any wait for the origin.
- `load_average`: the host's 1, 5 and 15 minute load averages, read when the attempt starts, beside `start` and before the exchange.
  - It is a JSON array of exactly three numbers in that order, each rounded to two decimal places, the precision `/proc/loadavg` and `sysctl vm.loadavg` print. Example: `[9.82, 8.26, 7.69]`.
  - On darwin it is read from the `vm.loadavg` sysctl (`struct loadavg`: three `fixpt_t` values divided by `fscale`). Go's standard `syscall.Sysctl("vm.loadavg")` returns it, with its trailing zero byte trimmed (23 bytes on darwin/arm64).
  - On linux it is the first three fields of `/proc/loadavg`.
  - It is JSON `null` on any other platform and whenever the read fails. That never fails or delays the attempt.
  - Only the standard library is used: no new module dependency, no subprocess, no option, setting or environment variable.

Both keys are on every attempt record of every route and mode: completed, failed and cancelled attempts; ChatGPT `Request.Single` attempts; condensation attempts; Responses, Messages and Chat Completions. Nothing else changes:
- Every existing key keeps its value, including `timestamp`, `wall_ms` and the stream observations.
- The request bytes, retries, waits, the response budget, results, errors and events are unchanged.
- `Response`, `Request`, the `Observer` interface and the `Client` fields are unchanged.
- The unused `operation.timestamp` field may serve as, or be replaced by, the request start. That choice is the Build's.

The contract's rule for an additive v1 event field asks for a contract note and a conformance fixture. So `docs/contract/loop-v1.md` gets one note beside the "Every provider attempt record also carries stream observations" bullet, naming the two keys, the request start, the attempt start, the array order and rounding, and `null`. A conformance test is added too. Out of scope: `tools/` (L-SHELL-WAIT-INSTANTS), the `request.started` event, Kogen's run logs, its vendored copy and pin, and CHANGELOG.md (commit history records changes).

## Decisions
- Each attempt record carries its start offset from the request start and the host load average at attempt start; nothing else changes (source: request)
- The offset is `request_offset_ms`, integer milliseconds like the record's other `*_ms` fields. The request start is the start of the `Respond` call, from which the response budget counts, so time spent before the first attempt (credentials, refresh) is visible (source: request)
- The load is `load_average`, the three standard 1/5/15 minute values rounded to two decimals, `null` where the host gives none (source: request)
- The change stays in the attempt-record construction of `provider/` (with the request-start reading it needs) and does not touch `tools/` (source: request)

## Source comparison
- Addressed, the X-L1 gate (only missing timestamps are added). At HEAD 11a6dcb (production code identical to 05a4ccb; HEAD only changes `.kogen/project.yaml`):
  - The record already has `timestamp`, the attempt start in microsecond UTC, and `wall_ms`, the attempt's own duration. Stream observations are relative to the attempt's own start.
  - Nothing records the request start: `operation.timestamp` is set in `Respond` but never written, and the `request.started` event `time` has whole-second resolution.
  - Nothing reads the host load anywhere in the module.
  - So only the offset and the load are added, and `timestamp` and `wall_ms` stay as they are.
- Addressed, Need "start offset from the request start": `request_offset_ms`.
  - The acceptance checks the first attempt of a plain request (0 to under 1000 ms).
  - It checks a request whose expired token is refreshed through a fake token endpoint that answers after 1500 ms: the first offset is at least 1450 and under 4500 ms. That tells a request-start offset from an offset counted from the first attempt.
  - It checks a 429 `Retry-After: 1` retry: the second offset is at least the first offset plus the first attempt's `wall_ms` plus 1000 ms, less 1 ms rounding. Its gap from the first offset matches the gap of the two `timestamp`s within 1 ms, and the fake provider's arrival gap within 300 ms.
- Addressed, Need "the host load average at attempt start": `load_average`.
  - The acceptance checks three non-negative numbers with at most two decimals, each within a tolerance of the host's own readings, `/usr/sbin/sysctl -n vm.loadavg` on darwin or `/proc/loadavg` on linux, taken just before and just after the run.
  - The tolerances are 1 + 25%, 0.5 + 10% and 0.25 + 5% of the higher reading, for the 1, 5 and 15 minute values.
- Addressed, "Nothing else changes": the acceptance requires each record's keys to be exactly the unchanged tree's keys plus the two new ones.
  - Those keys were recorded from the unchanged CLI: 32 keys for a completed attempt, and the same plus `provider_failure` for a failed 429 attempt.
  - The existing provider tests keep the record values, request bytes, retries and budgets.
- Addressed, Independence ("provider/respond.go attempt-record construction only; not tools/"): changes are in `provider/` only, plus the contract note and the tests. The request start is read where the call begins (`provider/client.go` `newCall` or `Respond`), because the record cannot know it otherwise.
- Evidence, `provider/respond.go:73` (`Observer`: one `provider_attempt` record per transport attempt, plain JSON map): confirmed in this checkout.
- Evidence, not present in this checkout, motivation only and not reproduced as thresholds:
  - the retained Terra logs (149 attempts / 148 requests);
  - the 442 s gap between provider_attempt (19:16:48Z) and the next request start (~19:24:10Z), aorctl-st2rr cancelled-account-cleanup r1;
  - the 503 s gap between attempts of request 13 with attempts of 4.6 s and 8.7 s, aorctl-st2 kamal r3;
  - refill.log, resource-watch `latest.json`, and climb/loop/LANE.md climb-loop-2 and climb-loop-3.
- Omitted, separate: attributing those historical gaps, and keeping a host-load history outside the attempt record.

## Tests
- Every attempt record carries `request_offset_ms` from the `Respond` call's start, including the time before the first attempt and the waits between attempts: acceptance scenarios `A single attempt records its offset and the host load`, `Time spent before the first attempt counts in its offset` and `A retried attempt records its later offset from the same request start`, plus a new `provider` test with a scripted `Client.Now` that advances the clock before the first attempt and in `Client.Sleep`, and checks the exact offsets of a first attempt and of retried attempts in the `Observer` records, both through the retrying path and through ChatGPT `Request.Single` (integration)
- Every attempt record carries `load_average`, three two-decimal 1/5/15 minute values on darwin and linux, `null` elsewhere or on a failed read: the same acceptance scenarios, plus a `provider` test checking on darwin and linux that the record's `load_average` is three finite non-negative two-decimal numbers (integration)
- The CLI's `request.attempt` records keep every existing key and add only the two: the acceptance key-set steps, plus a new conformance test that runs `provider.Client.Respond` against the existing fake provider with a scripted `Client.Now` and a recording `provider.Observer`, checking both keys on a completed and a retried attempt, the conformance fixture the contract asks of an additive field (integration)
- Existing record fields, request bytes, retries and budgets are unchanged: the pinned record key set of `TestStreamObsCompatibility` (`provider/streamobs_test.go`) is updated to expect the two new keys, and every other existing test keeps passing unchanged under `go test -race ./...` (existing)

## Feasibility
- Repository inspection:
  - The record is built only in `(*run).record` (`provider/respond.go`), from `(*run).transport`'s `start`.
  - The request's call start is the `c.now()` in `newCall` (`provider/client.go`), from which the budget deadline is computed.
  - `loop/session.go` forwards the record unchanged as `request.attempt` `record`. `loop/condense.go` only adds `purpose`.
  - No external protocol or library is involved beyond the operating system's load average, so no documentation lookup was needed.
- Scratch checks, outside the checkout (a `git archive` copy of HEAD):
  - Go's `syscall.Sysctl("vm.loadavg")` on darwin/arm64 returned 23 bytes. Decoding it as three little-endian `uint32` divided by the `uint64` `fscale` gave `8.73 7.36 7.32`, equal to `/usr/sbin/sysctl -n vm.loadavg` (`{ 8.73 7.36 7.32 }`).
  - A reference implementation stored `start` on the call, added the two keys in `record`, and added a darwin load reader. With it, `go build ./...` and `go vet ./provider` were clean. `go test ./conformance ./loop ./contract` passed, and `go test ./provider` failed only `TestStreamObsCompatibility` on its pinned key list, which this Intent updates.
  - The submitted acceptance passed all 3 scenarios in about 4 s.
- The unchanged tree fails all 3 scenarios only on the missing feature: the record-key step reports the existing keys without `load_average` and `request_offset_ms`. The attempt count, refresh count and exit code steps before it pass, so the fake provider, the expired-token refresh and the retry reach the intended paths.
- evidence: {"id":"attempt-gap-load-observer","kind":"observer","inputs":["features/steps/l_attempt_gap_load.js"],"observers":["features/steps/l_attempt_gap_load.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/l_attempt_gap_load.js --control good","exit":0,"output":"attempt gap and load observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/l_attempt_gap_load.js --control bad","exit":1,"output":"attempt gap and load observer rejected\n"}]}
