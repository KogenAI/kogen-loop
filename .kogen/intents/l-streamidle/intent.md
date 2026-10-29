# Enforce default provider idle timeouts

Slug: l-streamidle
Model: .kogen/intents/l-streamidle/model.qnt invariants=Ceiling,Bounds seed=29 samples=100 steps=40
Acceptance:
- .kogen/intents/l-streamidle/acceptance.feature
- features/steps/l_streamidle.js

Replace absolute-budget-only provider waits with per-attempt first-byte and idle timeouts in provider/respond.go: exchangeResponses, exchangeMessages and exchangeChat. Use Client.Now for elapsed-time decisions, including before/after blocking transport and reads; arrange cancellation of blocked headers/reads rather than waiting for another byte to detect silence. Close bodies and stop attempt timers when attempts finish. Existing Client.Sleep/clock fixtures and scripted transports in provider/streamobs_test.go are available; no external service or dependency is needed. Tests must exercise Client.Respond with local/fake transports and actual parsers, not just timeout helpers. Builder owns the named Go tests invoked by acceptance; they are not protected artifacts.

## Decisions
- Defaults apply to everyone, without a caller-facing option: first byte within 90 s for ChatGPT on Responses and Chat Completions, 45 s for Anthropic Messages and every other provider; idle 180 s. (source: request)
- For streams the first-byte clock starts at request dispatch, not headers; any actual byte including heartbeat resets idle, not only a parsed content delta. Headers do not count as the first stream byte. For non-streaming Chat Completions, first-byte means headers and idle starts at headers and renews on body bytes. Expire at the limit if no byte has arrived; bytes strictly before the deadline are valid. (source: request)
- Timeout ends only the attempt as resTransient, with detail containing `no first byte within 90 s`, `no first byte within 45 s` or `stream idle for 180 s` as applicable; record outcome failed and end_reason idle, including non-streaming timeout attempts. Successful non-streaming telemetry otherwise stays unchanged. Retry via existing attempt policy, including Request.Single, with unchanged count/backoff. Absolute budget and cancellation retain precedence over an overlapping timeout. (source: request)
- Keep 30-minute absolute default and lower-only budgets unchanged; bytes and retries cannot renew it. No request bytes or public options change. Any test timeout override must be unexported and lower-only. Tests use simulated time and finish in a few real seconds. (source: request)
- Update docs/contract/loop-v1.md adjacent to its absolute-budget clause and reconcile the observation-only/reserved-idle telemetry wording. Kogen retains 10-minute build/review and 30-minute shape budgets (K-SHAPEBUDGET); this repository does not change them. Re-pin with the next Kogen landing as an operator commit, then tell research the actual Kogen SHA; do not fabricate completion or edit a foreign checkout. (source: request)
- Shared host safety: temp directories only for scratch work, no synthetic CPU load, never stop processes by name/pattern, only PIDs started by this work. (source: request)

## Source comparison
- Addressed: request What to build 1–4 and Acceptance are represented by Decisions and the executable named-test matrix below, covering all three exchanges, header stalls, streaming stalls and healthy long generation.
- Addressed: Must stay and Loop default preserve absolute ceiling, existing retries/backoff and byte-identical requests with no public knob; Compatibility and AbsoluteBudget tests enforce these alongside existing budget/stream observation coverage.
- Addressed: Why cites proposals/stream-timeouts-2026-10-29.md and the 29 Oct 2026 ruling: completed sol-high shape responses up to 835 s with 17–28k tokens at 33–36 tok/s, silent stalls at 757–901 s with 4–9 s retries, longest measured pre-content silence 47.9 s. These motivate, but do not replace, the settled 90/45/180 defaults. L-STREAMOBS (48840cb) first_byte_ms/max_gap_ms remain available for later tuning; no tuning knob is added.
- Superseded: docs/contract/loop-v1.md observation-only/reserved idle description only insofar as required to enforce the new default. Other observation fields and request semantics remain intact.
- Addressed as operator handoff, not in-repository implementation: request Then re-pin and report research Kogen SHA on next landing; no current Kogen SHA or pin update is claimed. No requested behavior is deliberately omitted.

## Tests
- First-byte expiry across both stream providers and all exchange header paths: TestStreamIdleFirstByte through Client.Respond; cover ChatGPT 90 s, Anthropic/other 45 s, headers arriving without body, just-before and expiry boundaries, failed idle record/detail and successful retry (integration)
- Byte silence after progress: TestStreamIdleGap through Client.Respond for Responses, Messages and Chat Completions bodies; 180 s expiry versus just-before, heartbeat/partial-frame bytes reset idle, zero-byte reads do not, retry completes with failed idle then completed record (integration)
- Healthy long streaming must not be total-time-capped: TestStreamIdleLongStream completes 800 simulated seconds on both streaming wires, each byte gap below 180 s, including content-free heartbeats (regression)
- Absolute ceiling wins without renewal: TestStreamIdleAbsoluteBudget continuously streams past a lower budget, verifies budget end_reason not idle, no extra attempt after expiry, and shared budget across retry/backoff (regression)
- Requests, retry count/backoff, Single and no new public options: TestStreamIdleCompatibility plus existing budget/stream observation tests, three exhausted transient attempts and existing 2 s/8 s backoff where applicable, byte comparisons against existing encoders, no-observer operation (integration)
- Blocked I/O actually terminates and resources are cleaned: TestStreamIdleBlocked uses cancellable local transport/body with coordinated simulated clock and bounded real-time guard; prove before-header and after-byte stalls terminate without a late byte, body closure and no retained attempt timer after success (integration)
- Maintained timeout defaults and adjacent budget documentation: inspect docs/contract/loop-v1.md and run all configured go-format, go-test, go-vet and go-build checks (existing)

## Feasibility
- Existing fake clock and obsEnv/obsTransport fixtures support simulated elapsed reads and local Client.Respond entry; blocked cancellation needs its own coordinated fixture during implementation, not paid provider probing.
- Model typechecked with Kogen Quint (probe 2: exit 0, 0.3 s). Abstract ticks model first-byte, idle and absolute stop without renewing elapsed time; concrete seconds/provider selection are covered by tests. Initial model syntax failed effect checking and was corrected before submission.
- Named-test route checked with `go test -json ./provider -run '^TestStreamIdleFirstByte$' -count=1 -timeout=30s` (probe 1: exit 0); current tree reports no tests to run, so acceptance must reject absence rather than accept package-level PASS.
