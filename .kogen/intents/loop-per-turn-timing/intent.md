# Record model time on every response event

Slug: loop-per-turn-timing
Model: not applicable — the change adds one measured field to an event and has no state machine
Acceptance:
- .kogen/intents/loop-per-turn-timing/acceptance.feature
- features/steps/loop-per-turn-timing__turns.js
- features/steps/loop-per-turn-timing__driver/acceptance_test.go.txt

Every `response` event of a session gains one additive integer field `model_ms`: the wall time in whole milliseconds of that model turn, from the moment the session starts the turn's request (the instant its `request.started` event is emitted) to the moment the response is complete (the instant its `response` event is emitted). It is an int64 in the Go event and an integer in the JSON. The per-tool-call time `elapsed_ms` on `tool.result` is unchanged. Together the two give, inside one run's event stream, the wall time of every model turn and every tool call.

The clock is the one the session already uses for `elapsed_ms`: `tools.Tools.Now`, falling back to the real time when nil. The two reads per turn (request start, response complete) are the only added clock reads.

Scope: `loop/session.go`, `docs/contract/loop-v1.md` (the `response` row of the event table gains `model_ms`, and one sentence says `model_ms` and `elapsed_ms` use the same clock) and one new test file `loop/turn_model_ms_test.go` in package loop that follows the pattern of `TestSessionToolResultElapsedUsesTheToolsClock` (local openai-compatible test server, probe tool, one shared mutex-guarded injected clock that the fake provider advances before it answers and each probe call advances). The new test file must not define a test named `TestLoopPerTurnTimingAcceptance` nor any identifier starting with `lptt`, which Kogen's acceptance injects into the same package. Existing conformance fixtures and tests are not edited. Only response events get the field: no other event gets a new field, no new event type is added, nothing is written elsewhere, and the condensation requests behind `context.condensed` are not turns. The order and number of events, every request body sent to the provider and everything the model receives stay as they are. Out of scope: `api/api.go`, `cmd/kogen-loop/main.go`, `CHANGELOG.md`, all other documentation, `session.ended`, retry counting, aggregation or totals, the planner and other loops.

The required round: three turns on one shared injected clock. Turn one: the provider takes 300 and answers with one probe call of 200. Turn two: the provider takes 100 and answers with two probe calls, of 150 and of 50, run one after another. Turn three: the provider takes 100 and answers with the finish call. The three response events carry `model_ms` 300, 100 and 100 as integers, in that order; the `tool.result` events carry `elapsed_ms` 200, 150 and 50; the finish call has no `tool.result`. The wall time of the round on the clock is 900, and the sum of the three `model_ms` and the three `elapsed_ms` is at most that wall time. With the tools Now function nil, a one-turn round gives a response event whose `model_ms` is a non-negative int64.

## Decisions
- `model_ms` is an int64 on every response event, measured from the emission of that turn's `request.started` to the emission of its `response` event on `tools.Tools.Now` (real time when nil), with exactly two added clock reads per turn and no other event changed. (evidence: loop/session.go; loop/tool_result_elapsed_test.go; docs/contract/loop-v1.md) (source: request)
- Acceptance injects its own Go test file into package loop through go test -overlay instead of running the Build's `loop/turn_model_ms_test.go`, which does not exist before the Build. (evidence: features/steps/caller_shell_bound.js) (source: request)
- Every response event gains one additive integer field model_ms (int64 in the Go event, integer in JSON): whole milliseconds from the instant the turn's request.started is emitted to the instant its response event is emitted, read from the session's tools Now function, falling back to time.Now when nil; exactly two added clock reads per turn. (decision: D1, round 1) (constraint: only response events get model_ms) (constraint: tool.result elapsed_ms, event order and count and request bodies stay unchanged) (constraint: no new clock seam, goroutine, timer, file or network access) (evidence: loop/session.go; loop/tool_result_elapsed_test.go; docs/contract/loop-v1.md) (source: request)
- Acceptance injects its own Go test file into package loop through go test -overlay (named lptt_acceptance_test.go, identifiers prefixed lptt, test TestLoopPerTurnTimingAcceptance) instead of running the Build's loop/turn_model_ms_test.go, which does not exist before the Build. (decision: D2, round 1) (evidence: features/steps/caller_shell_bound.js) (assumption: none beyond the Build not defining lptt-prefixed identifiers in its own test file) (source: request)

## Source comparison
- Per-turn `model_ms` 300, 100 and 100 with a wall time of 900 ms and a sum of `model_ms` and `elapsed_ms` at most the wall time: addressed by the scenario "Model time per turn is separate from tool time", which writes the values as the list "300,100,100".
- Real clock with `Tools.Now` nil gives a non-negative int64: addressed by the real clock scenario.
- Retry-as-one-turn and the proof that only response events carry the field: omitted, a separate follow-up request.
- Existing `elapsed_ms` 200, 150 and 50 on `tool.result`, none for the finish call: unchanged, asserted in its own scenario that passes before the change, written as the list "200,150,50".

## Tests
- Model time per turn is exact and separate from tool time, and the sum of `model_ms` and `elapsed_ms` stays within the run's wall time: loop/turn_model_ms_test.go three-turn test on an injected clock (unit)
- A nil tools clock still gives a non-negative int64 `model_ms`: loop/turn_model_ms_test.go one-turn test (unit)
- Acceptance runs the rules through a real Session round via an injected overlay test: acceptance.feature (scenario)
- Existing conformance tests keep passing without edits: go test ./... (existing)

## Feasibility
- evidence: {"id":"turns-observer","kind":"observer","inputs":["features/steps/loop-per-turn-timing__turns.js","features/steps/loop-per-turn-timing__driver/acceptance_test.go.txt"],"observers":["features/steps/loop-per-turn-timing__turns.js","features/steps/loop-per-turn-timing__driver/acceptance_test.go.txt"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/loop-per-turn-timing__turns.js --control good","exit":0,"output":"loop-per-turn-timing observer good\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/loop-per-turn-timing__turns.js --control bad","exit":1,"output":"loop-per-turn-timing observer bad rejected\n"}]}
