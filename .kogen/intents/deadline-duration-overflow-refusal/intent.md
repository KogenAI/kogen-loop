# Refuse task deadlines that overflow a duration

Slug: deadline-duration-overflow-refusal
Model: not applicable — this is a stateless numeric validation rule
Acceptance:
- .kogen/intents/deadline-duration-overflow-refusal/acceptance.feature
- features/steps/deadline-duration-overflow-refusal__steps.js
- features/steps/deadline-duration-overflow-refusal__driver/probe_test.go.txt

Refuse `deadline_seconds` values that cannot be represented as a positive `time.Duration` in seconds, naming `deadline_seconds` and the supplied value. Zero is the exception: it still means no task deadline. In `cmd/kogen-loop/main.go`, `validateTask(api.Task) (string, error)` currently checks for negative values, but `execute` can multiply an unchecked positive integer by `time.Second`. Replace that unchecked acceptance with an inclusive upper bound in `validateTask`. It still returns the absolute task root and nil for an otherwise valid task, and uses the existing `*sys.Error` invalid-task path for a refusal. (evidence: cmd/kogen-loop/main.go; api/api.go; sys/error.go)

Production and implementation-test scope is `cmd/kogen-loop/main.go` and the new `cmd/kogen-loop/main_test.go`. Do not change the deadline unit, valid deadline behavior, provider response budgets, task encoding, or unrelated validation. Leave `execute`'s timeout logic alone; the admitted positive seconds now fit its multiplication. A refused CLI task emits the existing `error` (`class: loop`, `reason: invalid_task`, `detail` naming the field and integer) followed by `session.ended` (`status: failed`, `exit: 2`), never starts a session, and exits 2. (evidence: cmd/kogen-loop/main.go; docs/contract/loop-v1.md)

## Decisions
- Accept the largest whole-second duration and refuse larger positive deadline_seconds values in validateTask before they reach timeout creation. (constraint: Preserve zero as no task deadline, the existing negative refusal, and execute's current timeout behavior for valid positive seconds.) (evidence: api/api.go; cmd/kogen-loop/main.go; go.mod) (source: request)
- Use the existing invalid-task refusal path for overflow and put both the deadline_seconds field name and the supplied decimal integer in its detail. (decision: D2, round 1) (constraint: Keep the existing CLI refusal envelope and exit code; the exact overflow sentence is not part of the contract.) (evidence: cmd/kogen-loop/main.go; sys/error.go; docs/contract/loop-v1.md) (source: request)
- Check the inclusive whole-second duration bound in validateTask before conversion or multiplication; compare in int64, using math.MaxInt64 divided by the nanoseconds in time.Second. (decision: D1, round 1) (constraint: Preserve zero as no task deadline, the existing negative refusal, and execute's current timeout behavior for valid positive seconds.) (evidence: api/api.go; cmd/kogen-loop/main.go; go.mod) (source: request)
- Accept the largest whole-second duration and refuse larger positive deadline_seconds values in validateTask before they reach timeout creation. (decision: D3, round 1) (constraint: Preserve zero as no task deadline, the existing negative refusal, and execute's current timeout behavior for valid positive seconds.) (evidence: api/api.go; cmd/kogen-loop/main.go; go.mod) (source: request)

## Source comparison
- Superseded: ev-d8a8c8cb identifies unchecked positive seconds flowing from `validateTask` into `execute`'s duration multiplication. The upper-bound rule and the first-unrepresentable validation scenario replace that behavior, with `controls.json` restoring the missing overflow guard as a counterexample.
- Addressed: Request acceptance 1 requires the first unrepresentable value to be refused and named with `deadline_seconds`. Both the first-unrepresentable validation scenario and the built-CLI scenario assert that result; separate wrong controls omit the field or value.
- Addressed: Request acceptance 2 requires the representable limit to succeed without waiting for it. The largest-whole-second scenario calls only `validateTask` and rejects the exclusive-upper-limit control. Request acceptance 3 is covered by the zero and negative validation scenarios plus their matching wrong controls.
- Omitted by scope, not changed: deadline units, valid timeout execution (including zero disabling the timeout and positive expiry), provider response budgets, and other validation. No schema or configuration edits. (evidence: cmd/kogen-loop/main.go; api/api.go; docs/contract/loop-v1.md)

## Tests
- Values above the whole-second limit are refused as invalid tasks with the field and input in the detail: add the first-unrepresentable case to TestValidateTaskDeadlineSeconds in cmd/kogen-loop/main_test.go (regression)
- The largest representable value and zero are accepted, and negatives are invalid: add the three preservation cases to TestValidateTaskDeadlineSeconds and call validateTask directly without running the round (unit)
- An overflowing JSON task is rejected before the session starts: run the built CLI through the overflow refusal scenario in acceptance.feature (scenario)
- Ordinary positive deadlines still cancel work at expiry: TestDeadlineEndsAHangingRequest stays unchanged (evidence: conformance/process_test.go) (existing)

## Feasibility
- The configured Gherkin runner supplies Node and Cucumber (observed Node v26.13.1, Cucumber 13.3.0); acceptance was prepared with Go 1.27.2 on darwin/arm64. Local Go documentation confirmed Duration is int64 nanoseconds. The two upper-bound inputs fit a 64-bit Go `int` but cannot be passed to `validateTask` on a 32-bit target; zero and negative inputs are representable on both. (evidence: .kogen/project.yaml; go.mod; api/api.go)
- The Go fixture overlays one same-package test without adding a source file to the working package. It runs one named observer with a temporary root, decimal seconds and a fresh output path. The file holds JSON with `root` and an optional `error` object (`class`, `reason`, `detail`, `exit` for `*sys.Error`). The CLI fixture pipes one otherwise valid JSON task to `kogen-loop run --task -` with a temporary root and empty HOME; no sign-in or real provider request is needed. On the unchanged CLI, the overflow input reached `provider/login` and failed with exit 1 instead of returning `invalid_task`.
- Scratch checks verified that the correct control patch compiles and each wrong patch applies on top of it.
- evidence: {"id":"deadline-observer","kind":"observer","inputs":["cmd/kogen-loop/main.go","features/steps/deadline-duration-overflow-refusal__steps.js","features/steps/deadline-duration-overflow-refusal__driver/probe_test.go.txt"],"observers":["features/steps/deadline-duration-overflow-refusal__steps.js","features/steps/deadline-duration-overflow-refusal__driver/probe_test.go.txt"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/deadline-duration-overflow-refusal__steps.js good","exit":0,"output":"deadline observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/deadline-duration-overflow-refusal__steps.js bad","exit":1,"output":"deadline observer rejected\n"}]}
