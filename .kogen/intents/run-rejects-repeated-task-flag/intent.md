# Refuse repeated task flags in run

Slug: run-rejects-repeated-task-flag
Model: not applicable — the change is a stateless command-line argument check with no state transitions
Acceptance:
- .kogen/intents/run-rejects-repeated-task-flag/acceptance.feature
- features/steps/run-rejects-repeated-task-flag__steps.js

The `run` command of the kogen-loop CLI parses its arguments with a scalar `task` flag and does not notice when the flag is given more than once, so the last value silently wins and the earlier task is discarded. After this change `run` invoked with the task flag two or more times is refused as an invalid task: the stdout events are an `error` event (class `loop`, reason `invalid_task`) whose detail names the repeated `--task` option, followed by `session.ended` with status `failed` and exit 2. The refusal happens before any task is read, whether the repeated values are different paths or the same path, and including `-` for standard input. A single task flag, for a file or for standard input, behaves exactly as before.

Scope: `cmd/kogen-loop/main.go` and `cmd/kogen-loop/main_test.go`. Out of scope: task file decoding, task validation and the other command flags.

## Decisions
- Giving the task flag more than once is refused regardless of whether the values differ; two identical paths are refused as well as two different ones. Guarantee in the request's words: run invocations that supply the task flag more than once are refused. (source: request)
- The refusal reuses the existing invalid-task path of `execute` (error event class `loop`, reason `invalid_task`, exit 2, then `session.ended`) and its detail names the `--task` option and says it was given more than once; no new reason, flag or setting is added. (evidence: cmd/kogen-loop/main.go; cmd/kogen-loop/main_test.go) (source: request)
- The refusal is decided right after flag parsing, before the task is read from a file or standard input, so a repeated flag never causes a read. (evidence: cmd/kogen-loop/main.go) (source: request)
- Acceptance runs the real built kogen-loop binary and inspects its stdout events, rather than calling `execute`. Task paths in the refusal scenarios do not exist, so any read attempt would show up as a different error detail. (evidence: cmd/kogen-loop/main.go; features/steps/capabilities-json-flag-contract__steps.js) (source: request)
- The exact wording of the detail is not fixed; acceptance only requires that it contains `--task` and says the option was repeated (one of: more than once, repeated, twice, multiple). (assumption: wording of the refusal detail is the builder's choice within that constraint) (source: request)

## Source comparison
- Request: two task flags with different paths refused before either is read — addressed by scenario "Two task flags with different paths are refused before either file is read".
- Request: two task flags with the same path also refused — addressed by scenario "Two task flags with the same path are refused" and the `--task=` form in the same scenario family.
- Request: a single task flag for a file or standard input keeps its behavior — addressed by the three single-flag scenarios (missing file read failure, empty standard input, foreign-protocol task on standard input) and by the existing tests.
- Request: the invalid-task event identifies the repeated option — addressed by the step checking the error detail.
- Out of scope and unchanged: task file decoding, task validation, other command flags.

## Tests
- A repeated task flag, with different or equal values, is refused with an invalid-task error event naming `--task` and exit 2, before any read: add a table test in cmd/kogen-loop/main_test.go calling `run` with repeated task flags (unit), plus the acceptance scenarios through the built binary (scenario)
- A single task flag keeps its behavior: existing TestRunWithoutTaskEndsSessionWithZeroTiming and TestRunRefusesUnsupportedRequiredCapabilityBeforeSession, plus the single-flag acceptance scenarios (existing)

## Feasibility
- none
