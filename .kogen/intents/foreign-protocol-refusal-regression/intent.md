# Cover foreign task protocol refusal

Slug: foreign-protocol-refusal-regression
Model: not applicable — the test covers two outcomes of a stateless read, before any session starts
Acceptance:
- .kogen/intents/foreign-protocol-refusal-regression/acceptance.feature
- features/steps/foreign-protocol-refusal-regression__steps.js

Add a model-free regression test for `readTask`'s foreign-protocol refusal and its precedence over task-field decoding. The only implementation edit needed is additive coverage in `cmd/kogen-loop/main_test.go`; keep `cmd/kogen-loop/main.go` unchanged. No task decoding rules, protocol error text, or other tests change.

## Decisions
- For a valid JSON object with a foreign protocol and an unknown task field, refuse with `unsupported_protocol`; the detail names both the submitted and supported protocol. With the supported protocol, the same unknown field causes `invalid_task`. Test these observable errors, not private call order. (evidence: cmd/kogen-loop/main.go; api/api.go; docs/contract/loop-v1.md) (source: request)
- Add direct offline regression coverage of `readTask` in the existing command tests. Pass each feature input as standard input and assert the returned error has class `loop`, exit 2, the case's refusal reason, and detail naming both protocol values for the foreign case or the unknown field for the supported case. Keep the existing deadline test. (evidence: cmd/kogen-loop/main.go; cmd/kogen-loop/main_test.go; sys/error.go) (source: request)
- Acceptance builds the real command with Go 1.27.2 (`go build -o <temporary binary> ./cmd/kogen-loop`) and invokes `kogen-loop run --task -` with each feature input on stdin and an empty temporary HOME. Assert a `loop` error on JSON Lines stdout followed only by `session.ended` (`status: failed`, `exit: 2`); the process exits 2 and no session starts. The configured Node/Cucumber runner supplies the feature and report paths. (evidence: go.mod; .kogen/project.yaml; docs/contract/loop-v1.md; cmd/kogen-loop/main.go) (source: request)
- To distinguish added coverage from unchanged correct production behavior, acceptance runs the whole command package via `go test -json -count=1 ./cmd/kogen-loop` as written and with one temporary Go overlay per counterexample. The original run must pass with at least one test executed; each deliberately broken variant must fail an executed test, not fail to build. These checks use real package/test events and no filter for an unwritten test. The overlays never edit the checkout. (evidence: cmd/kogen-loop/main.go; cmd/kogen-loop/main_test.go) (source: request)

## Source comparison
- Addressed: `ev-52f6cf60` identifies the existing protocol peek and an uncovered refusal. The direct Go regression test in Decisions and both package-test comparisons in `acceptance.feature` address the gap without changing the peek or `api.DecodeTask`.
- Addressed: request acceptance 1 maps to “A foreign protocol takes precedence over the unknown field.” The test input has a foreign `protocol` and `unknown_field`; the CLI check preserves the existing detail, naming both protocols. The “decode fields first” control gets `invalid_task` instead and must be caught by the new tests on the altered package.
- Addressed: request acceptance 2 maps to “The supported protocol leaves the unknown field invalid.” Only the protocol value changes; the CLI check preserves `invalid_task` and its unknown-field detail. The “classify field errors as unsupported protocol” control fails the reason check and must also be caught by the new tests on the altered package.
- Addressed scope: the regression is model-free and changes only `cmd/kogen-loop/main_test.go`; the `main.go` changes in controls are scratch-only counterexamples. Omitting a new test fails the mutation check even though both original CLI responses are already correct. Decoding rules and error text are unchanged; no product behavior is superseded.

## Tests
- Foreign protocol takes precedence over unknown fields and the error names both protocols: add the foreign case of the direct `readTask` regression test in `cmd/kogen-loop/main_test.go` (regression)
- Supported protocol still reports an unknown field as invalid: add the supported case of the same `readTask` regression test (regression)
- Both refusals are visible before a session starts and both counterexamples are caught by the package tests: run the two CLI and scratch-variant comparisons in `acceptance.feature` (scenario)
- Keep the current deadline regression and run the configured Go format, test, vet and build checks from `.kogen/project.yaml`: existing checks (existing)

## Feasibility
- The command package passed offline with Go 1.27.2 (probe: exit 0, 1.6 s). Its real `go test -json` output reported `run`/`pass` for tests and a package `pass` without a `Test` field. The built CLI returned exit 2 for both feature inputs with the expected refusal details and failed ending. (probe: exit 0, 2.2 s)
- The formatted correct control adds one table-driven test; both wrong source patches applied cleanly to scratch. (capture probe: exit 0, 0.1 s)
- The observer good control ran the CLI and actual package tests with the correct test overlay, and both altered implementations failed an executed test. (probe: exit 0, 3.3 s)
- The observer bad control exercised both wrong CLI reasons, separately shortened otherwise correct details to reach the detail check, and rejected both surviving mutations with the pre-change test file. Its nonzero exit means the bad observations were rejected, not that a subprocess failed to start. (probe: exit 1, 4.4 s)
- evidence: {"id":"refusal-observer","kind":"observer","inputs":[".kogen/intents/foreign-protocol-refusal-regression/controls.json","cmd/kogen-loop/main.go","cmd/kogen-loop/main_test.go"],"observers":["features/steps/foreign-protocol-refusal-regression__steps.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/foreign-protocol-refusal-regression__steps.js good","exit":0,"output":"recognized both refusals and both test-detected regressions\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/foreign-protocol-refusal-regression__steps.js bad","exit":1,"output":"rejected wrong reasons, truncated details, and uncaught regressions\n"}]}
