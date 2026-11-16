# Print usage successfully for standalone help

Slug: kogen-loop-help-prints-usage
Model: not applicable — argument dispatch has no meaningful persistent or interacting state
Acceptance:
- .kogen/intents/kogen-loop-help-prints-usage/acceptance.feature
- features/steps/kogen-loop-help-prints-usage__cli.js

Fix cmd/kogen-loop so that exactly one argument, --help, -h or help, prints the unchanged usage line plus a newline on stdout, leaves stderr empty and exits 0. Replace only these forms' current invalid-invocation behavior. The usage text remains `usage: kogen-loop capabilities --json | version | run --task FILE|-`.

Nothing else changes: no argument, unknown commands and any help form followed by additional arguments retain empty stdout, the usage line plus newline on stderr and exit 2 (api.ExitInvalid). Preserve version, capabilities --json and run output and exit codes. Name the help form in the package comment of cmd/kogen-loop/main.go. Add a focused process regression test in conformance/process_test.go using the existing runPlain helper; it must exercise all three standalone forms and rejection with extra arguments without network, providers or credentials. Keep useful existing tests, including TestVersionAndUsage and TestCapabilitiesNeedNoNetworkOrCredentials.

## Decisions
- Recognize only the three specified help forms when they are the sole argument; add no flags, settings or compatibility paths. (source: request)
- Keep the usage literal unchanged, writing it to stdout only for successful help, and keep all other dispatch behavior unchanged. (source: request)
- Name the help form in the existing command package comment and use the existing runPlain helper for a focused process regression test in conformance/process_test.go. (evidence: cmd/kogen-loop/main.go; conformance/process_test.go) (source: request)

## Source comparison
- Addressed: request Expected and scenarios 1–2 map to the three successful-help scenarios in acceptance.feature, including exact newline, stdout, stderr and exit code; the old invalid-invocation outcome is superseded only for singleton help arguments.
- Addressed: request scenario 3 and Constraints map to explicit extra-argument scenarios for help, --help and -h, plus no-argument and unknown-command scenarios. These retain exact stderr usage and exit 2, with empty stdout.
- Addressed: the request's unchanged usage literal is preserved verbatim above and in executable expectations. The required package-comment change is observed in the long-help scenario. The focused conformance/process_test.go test using runPlain is an implementation requirement above, not a dependency on a test that does not yet exist.
- Addressed: unchanged version has an explicit process scenario; capabilities --json and run preservation remain covered by existing conformance tests and the configured go-test gate. Repository evidence: conformance/process_test.go; .kogen/project.yaml. No provider transport, authentication or network feature is added. No requested behavior is deliberately omitted or conflicting.

## Tests
- Standalone --help succeeds with exact usage on stdout: add the focused runPlain regression test and Long help prints usage acceptance scenario (regression)
- Standalone -h and help have identical successful output: cover both aliases in the focused process test and their CLI acceptance scenarios (scenario)
- Help with additional arguments stays invalid: cover all three forms in the focused process test and exact-output CLI acceptance scenarios (regression)
- No argument and unknown commands stay invalid: retain TestVersionAndUsage and exercise exact stderr, stdout and exit through acceptance (scenario)
- Existing version, capabilities --json and run behavior stays unchanged: preserve TestVersionAndUsage, TestCapabilitiesNeedNoNetworkOrCredentials and the existing conformance coverage under go test ./... (existing)
- The package comment names help: inspect the package comment in the successful long-help scenario (scenario)

## Feasibility
- Local toolchain and scoped baseline confirmed: go version reported go1.27.2 darwin/arm64; building ./cmd/kogen-loop, invoking its version form, and running existing TestVersionAndUsage and TestCapabilitiesNeedNoNetworkOrCredentials passed. (probe 1: exit 0, 1.6 s)
- Prepared bounded correct and wrong implementation overlays in controls.json; the correct overlay passed the focused process regression and the two existing command tests. This was a scratch proof artifact, not a production edit or acceptance run. (probe 2: exit 0, 2.1 s)
