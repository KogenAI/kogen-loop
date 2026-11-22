# Make capabilities require its documented --json

Slug: capabilities-json-flag-contract
Model: not applicable — the change is a stateless command-line argument check with no state transitions
Acceptance:
- .kogen/intents/capabilities-json-flag-contract/acceptance.feature
- features/steps/capabilities-json-flag-contract__steps.js

The `capabilities` command of the kogen-loop CLI declares a `json` flag that defaults to true and is never consulted, so `capabilities` with no flag and `capabilities --json=false` print the capabilities object although the usage string documents `capabilities --json` as the only form. After this change `capabilities --json` exits 0 and prints exactly one JSON capabilities object on stdout. `capabilities` without the flag, and `capabilities --json=false`, are rejected as an invalid command: exit code 2 (the normal invalid-command exit, as for `capabilities --yaml`) and nothing on stdout. The capabilities object fields, task parsing and the other commands are unchanged.

Scope: `cmd/kogen-loop/main.go` and `conformance/process_test.go`.

## Decisions
- `capabilities` succeeds only when the json flag is present and true; an absent flag or a false value is an invalid command with exit 2, usage on stderr and empty stdout. (evidence: cmd/kogen-loop/main.go; conformance/process_test.go) (source: request)
- The flag default is no longer true: the existing Bool flag keeps the name `json` and its value is checked after parsing, so no new flag, setting or environment variable is added. (evidence: cmd/kogen-loop/main.go) (source: request)
- The usage string and the supported form `capabilities --json` stay as they are. (evidence: cmd/kogen-loop/main.go) (source: request)
- Acceptance runs the real built kogen-loop binary with each of the three argument forms and checks exit code and stdout, rather than calling an internal function. (evidence: conformance/process_test.go; features/steps/caller_shell_bound.js) (source: request)

## Source comparison
- Request: `capabilities --json` accepted with one JSON object — addressed by scenario "capabilities --json is accepted" and the existing TestCapabilitiesNeedNoNetworkOrCredentials.
- Request: `capabilities` with no flag rejected, no JSON on stdout — addressed by scenario "capabilities without --json is rejected".
- Request: `capabilities --json=false` rejected, no JSON on stdout — addressed by scenario "capabilities --json=false is rejected".
- Out of scope and unchanged: the capabilities object fields, task parsing, the other commands, and the existing `capabilities --yaml` rejection.

## Tests
- `capabilities --json` exits 0 and prints exactly one JSON object: existing TestCapabilitiesNeedNoNetworkOrCredentials in conformance/process_test.go, plus the acceptance scenario (existing)
- `capabilities` without --json and `capabilities --json=false` exit 2 with empty stdout: add both argument lists to the rejected-invocation list in TestVersionAndUsage in conformance/process_test.go (regression)
- Rejection of the absent flag and of the false value through the built binary: acceptance scenarios in acceptance.feature (scenario)

## Feasibility
- none
