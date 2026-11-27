# Pin session.ended timing of a refused task

Slug: refused-task-session-timing-regression
Model: not applicable — the test covers one stateless refusal that ends before any session starts
Acceptance:
- .kogen/intents/refused-task-session-timing-regression/acceptance.feature
- features/steps/refused-task-session-timing-regression__steps.js

Add a model-free regression test for the `session.ended` timing that `kogen-loop run` emits when task processing fails before session startup. The documented behavior already exists: a task refused before the session starts has zero timing. The only implementation edit needed is additive coverage in `cmd/kogen-loop/main_test.go`; keep `cmd/kogen-loop/main.go` unchanged. Timing fields and timing behavior of started sessions are out of scope and unchanged.

## Decisions
- The test runs the command's `run` entry with the single argument `run` (no `--task`), empty standard input, and in-memory stdout and stderr, then decodes stdout as JSON Lines. The refusal is the invalid-task refusal "run needs --task FILE|- ..." (class `loop`, reason `invalid_task`). (evidence: cmd/kogen-loop/main.go; cmd/kogen-loop/main_test.go; api/api.go) (source: request)
- The final event is `session.ended` with `status` `failed` and `exit` 2, and its `timing` object has exactly the keys `wall_ms`, `provider_wait_ms`, `backoff_ms`, `tool_wall_ms`, `overhead_ms` and `session_wall_ms`, each the number 0, plus `tool_ms` as an empty JSON object. An absent key, a nonzero value, or a null `tool_ms` fails the test. (evidence: docs/contract/loop-v1.md; loop/timing.go; cmd/kogen-loop/main.go) (source: request)
- The refusal still emits an `error` event immediately before `session.ended` (exactly these two events, in this order), and `run` returns the invalid-task exit code (`api.ExitInvalid`, 2). The test asserts both so a broken refusal path cannot hide behind a timing-only check. (evidence: cmd/kogen-loop/main.go; api/api.go) (source: request)
- Acceptance builds the real command with Go 1.27.2 and runs `kogen-loop run` with no task argument in an empty temporary directory and HOME. It asserts the timing and the refusal on stdout and exit status 2. It then runs the whole package tests via `go test -json -count=1 ./cmd/kogen-loop` as written and with one temporary Go overlay of `main.go` per named wrong implementation (nonzero `session_wall_ms`, a deleted `overhead_ms`, a null `tool_ms`, no error event, a failed exit code instead of the invalid-task code). The original run must pass; each altered run must fail an executed test, not a build. The checkout is never edited. No test name is required. (evidence: go.mod; .kogen/project.yaml; cmd/kogen-loop/main.go; cmd/kogen-loop/main_test.go) (source: request)

## Source comparison
- Addressed: evidence `ev-45f2a012` — `docs/contract/loop-v1.md` says a task refused before the session starts has zero `session.ended` timing; `cmd/kogen-loop/main.go` takes timing from a nil session on this path. The new direct CLI-level test in `cmd/kogen-loop/main_test.go` pins it; no production code changes.
- Addressed: request acceptance 1 — the built-CLI scenario "A refused task reports zero session timing" and the Go test assert all six zero fields and the empty `tool_ms` map. The wrong implementations "nonzero session wall time", "absent overhead field" and "null tool map" are rejected.
- Addressed: request acceptance 2 — the scenario "A refused task emits its error before session.ended" and the Go test assert the error event, its order before `session.ended`, and exit 2. The wrong implementations "no error event" and "failed exit code for a refused task" are rejected.
- Out of scope and preserved: timing fields and timing behavior for started sessions; the `main.go` edits in the controls are scratch-only counterexamples.

## Tests
- A refused task's `session.ended` has all-zero timing fields and an empty `tool_ms` object: add `TestRunWithoutTaskEndsSessionWithZeroTiming` to `cmd/kogen-loop/main_test.go` (regression)
- The refusal emits an `error` event before `session.ended` and exits with the invalid-task code: same test (regression)
- The built CLI shows both outcomes and every wrong implementation is caught by the package tests: the two scenarios in `acceptance.feature` (scenario)
- Keep the existing command tests and run the configured Go format, test, vet and build checks: existing checks (existing)

## Feasibility
- Observed in a scratch copy of HEAD with the formatted correct test: the observer good control accepted the real CLI output and the real `go test -json` results (all five altered packages failed an executed test); the bad control (original test file and each altered CLI) was rejected throughout. The wrong-implementation patches applied cleanly with `git apply --check`.
- evidence: {"id":"timing-observer","kind":"observer","inputs":[".kogen/intents/refused-task-session-timing-regression/controls.json","cmd/kogen-loop/main.go","cmd/kogen-loop/main_test.go"],"observers":["features/steps/refused-task-session-timing-regression__steps.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/refused-task-session-timing-regression__steps.js good","exit":0,"output":"recognized the zero timing, the refusal, and every test-detected regression\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/refused-task-session-timing-regression__steps.js bad","exit":1,"output":"rejected wrong timings, wrong refusals, and uncaught regressions\n"}]}
