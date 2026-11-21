# Record how each turn spends its wall time

Slug: loop-turn-timing-events
Model: not applicable — the change adds read-only observation events and has no state machine
Acceptance:
- .kogen/intents/loop-turn-timing-events/acceptance.feature
- features/steps/loop-turn-timing-events__timing.js
- features/steps/loop-turn-timing-events__driver/timing_acceptance_test.go.txt
- features/steps/loop-turn-timing-events__driver/session_acceptance_test.go.txt

The session engine emits a new additive `turn.timing` event as the last event of every turn, and the `session.ended` event gains a `timing` field with the same keys (except n) summed over the turns the session ran itself, plus `session_wall_ms` (from `session.started` to `session.ended`). The events are observations only: with every `turn.timing` event and the `timing` field removed, the event stream is identical to the previous build apart from seq and time. Durations are integer milliseconds read from the clocks the engine already uses (Client.Now provider side, Tools.Now tools); no new clock seam, goroutine, timer, ticker, file or network access. Each turn adds exactly one event and at most eight clock reads beyond today's.

Keys of `turn.timing`: n (the request number of the turn's request.started), wall_ms, provider_wait_ms, backoff_ms (the request_offset_ms gap between attempts), tool_ms (object: tool name to the sum of the elapsed_ms of its results in the turn; empty object when no tools ran), tool_wall_ms (length of the union of the turn's tool call intervals), overhead_ms (wall_ms minus provider_wait_ms, backoff_ms and tool_wall_ms, never negative). A terminal call such as finish counts as a tool call only when it produces a tool result with an elapsed_ms.

Scope of the change: loop/session.go, loop/loop.go, api/api.go, cmd/kogen-loop/main.go (only to hand the session's timing summary from a session accessor to the session.ended event), docs/contract/loop-v1.md, CHANGELOG.md, the conformance fixtures whose expected event sequences gain turn.timing lines (updated with a sentence saying why), and new tests in the loop and contract packages. Every other file is out of scope; Kogen's own event persistence and the planner are out of scope.

## Decisions
- Each turn emits exactly one `turn.timing` event, after the last event the engine emits for that turn and before the next request.started and before every event emitted after the last turn (session.ended, and round.ended if the engine emits it first); a turn that fails after the request started also emits one. (evidence: loop/session.go) (source: request)
- Two overlapped shell calls are expressed in the acceptance on the injected tools clock: the second call's interval is the same interval as the first, so turn two has tool_ms shell equal to 600 and tool_wall_ms 300. The session runs calls one after another in real time; only the clock reading makes them overlap. (evidence: loop/loop.go; loop/session.go) (source: request)
- The fake tool is the real shell tool running `true`; the test makes the injected tools clock advance by the stated duration while the call runs, so each result's elapsed_ms is that duration and the tool_ms key is shell. No other tool name is used. (evidence: tools/tools.go; loop/turn_model_ms_test.go) (source: request)
- The provider is a local httptest server on the openai-compatible route; its handler advances the injected clock for the provider time, and Client.Sleep advances it for backoff, so no test really sleeps. (evidence: loop/turn_model_ms_test.go; provider/client.go) (source: request)
- The clock-read bound of the 30-turn session is held as measured constants of the unchanged tree: 11 Client.Now reads and 6 Tools.Now reads for each of turns 1 to 29, 11 and 2 for turn 30; each turn may add at most eight in total. (assumption: the measured counts are stable on the unchanged tree) (source: request)
- The session.ended summary and the resumed-session rule are checked through the built kogen-loop process against the conformance fake provider with real time (two answers of 300 ms, one shell call, then a resumed run of one answer): the timing field equals the sum of the run's own turn.timing events for provider_wait_ms, backoff_ms, tool_ms by tool name, tool_wall_ms and overhead_ms, and session_wall_ms is within 5 percent of the sum of provider_wait_ms, backoff_ms, tool_wall_ms and overhead_ms. This uses the fake provider's delay_ms and no injected clock and no retry, so the retry turn of the request's scenario 3 is covered by scenario 2 instead. (evidence: conformance/harness_test.go; conformance/process_test.go) (assumption: real-time slack stays within 5 percent for an 800 ms session) (source: request)

## Source comparison
- Scenario 1 (time split, overhead_ms 0 for turn one, tool_wall_ms 300 for turn two, provider_wait_ms 100 for turn three, 5 percent bound), scenario 2 (backoff_ms 2000 with provider_wait_ms 350; Retry-After of 3 seconds gives backoff_ms 3000), scenario 3 (session summary and resume) and scenario 4 (exactly 30 turn.timing events, shell call of 10, position check, eight extra clock reads) are addressed by the acceptance.
- The docs/contract/loop-v1.md, CHANGELOG.md and conformance fixture updates are required of the Build as the request states.

## Tests
- turn.timing split of provider, backoff, tools and overhead: loop package Go test with the shell tool, httptest provider and injected clocks (scenario)
- retry backoff and Retry-After counted as backoff_ms: same Go test file (scenario)
- turn.timing placement, count and clock-read cost over 30 turns: same Go test file (scenario)
- session.ended timing field summed over the turns of the session, resume counts only its own turns: conformance Go test through the built CLI (scenario)

## Feasibility
- none
