# Name the fault in refused run invocations

Slug: kogen-loop-run-refusals-name-the-fault
Model: not applicable — the change is the text of stateless refusal details
Acceptance:
- .kogen/intents/kogen-loop-run-refusals-name-the-fault/acceptance.feature
- features/steps/kogen-loop-run-refusals-name-the-fault__refusals.js

When `kogen-loop run` refuses before reading a task, the `error` event (class `loop`, reason `invalid_task`) now carries a `detail` that names the cause instead of the shared usage line, and an empty task input is told apart from text that is not JSON. Only the `detail` changes. The refusals keep exit code 2, the `session.ended` event with status `failed`, no `session.started` event, stdout that holds events only, and stderr as it is (the flag package text stays on stderr).

The detail is chosen by the first cause that applies, in this order (`execute` and `readTask` in cmd/kogen-loop/main.go):
1. The flag package refuses the arguments (unknown flag, flag without its value): the detail is the flag package error text, for `kogen-loop run --bogus` exactly `flag provided but not defined: -bogus` and for `kogen-loop run --task` exactly `flag needs an argument: -task`.
2. An argument is left over after the flags: the detail is `run takes no argument besides --task, got "` followed by the first leftover argument and a closing double quote, for `kogen-loop run --task - extra` exactly `run takes no argument besides --task, got "extra"`. No standard input is read and no request is sent.
3. No `--task`, or an empty value (`kogen-loop run`, `kogen-loop run --task ""`): the detail is exactly `run needs --task FILE|- (a task file, or - for standard input)`.
4. The task input holds no byte other than whitespace (checked after reading it and before the protocol check): from standard input the detail is exactly `the task read from standard input is empty`; from a file it is `the task file ` followed by the path exactly as given on the command line and ` is empty`, for `--task empty-task.json` exactly `the task file empty-task.json is empty`.

Input that is not empty but is not a JSON object keeps `invalid task: expected one JSON object`. The old shared usage-line detail for the argument faults and the shared JSON-object detail for empty input are removed.

Nothing else changes: the usage line itself (still printed for an unknown command), `version`, `capabilities --json`, `--help`, the `unsupported_protocol` refusal, every `validateTask` detail, the `cannot read the task:` detail for an unreadable file, and `api.DecodeTask` (public library API). No new flag, option or configuration. docs/contract/loop-v1.md does not state these details and is not changed; if it does by the time this is built, keep it in step. No network, provider or credentials are involved.

## Decisions
- The four faults are separate branches in `execute` (flag parse error text, leftover argument, missing task) and one emptiness check in `readTask` using the bytes read, with the stdin and file wordings chosen by whether the path is `-`. (decision: D1, round 1) (constraint: api.DecodeTask is unchanged; the empty check only precedes the protocol peek in readTask) (evidence: cmd/kogen-loop/main.go; api/api.go) (source: request)
- Whitespace-only input counts as empty (bytes.TrimSpace of the input has length 0); anything else that is not an object keeps the JSON-object detail. (decision: D2, round 1) (evidence: cmd/kogen-loop/main.go; api/api.go) (source: request)
- Acceptance runs the built CLI in a fresh temporary directory with a minimal environment (PATH and HOME only) and checks the error event, the exit code, the failed ending and the absence of session.started; it does not depend on Go tests the Build must write. (decision: D3, round 1) (evidence: conformance/harness_test.go; features/steps/kogen-loop-help-prints-usage__cli.js) (source: request)
- Existing tests pin none of these details, so no existing expectation needs updating. (decision: D4, round 1) (evidence: conformance/process_test.go) (source: request)

## Source comparison
- Addressed: Expected 1-4 and the empty-input and file examples map to nine scenarios in acceptance.feature with the exact detail texts: no task argument, empty task value, extra argument, unknown flag, flag without a value, empty standard input, whitespace-only standard input, non-JSON standard input (unchanged text) and empty task file.
- Superseded (observed old behavior): `kogen-loop run`, `kogen-loop run --task a b` and `kogen-loop run --bogus` each emitted `"detail":"usage: kogen-loop capabilities --json | version | run --task FILE|-"`; for `--bogus` the Go flag package also writes `flag provided but not defined: -bogus` to stderr, which stays there. `printf '' | kogen-loop run --task -` and `echo 'this is x' | kogen-loop run --task -` both emitted `"detail":"invalid task: expected one JSON object"`; an empty or whitespace-only task file gave the same detail without naming the file. After this change `echo 'this is x' | kogen-loop run --task -` still emits `invalid task: expected one JSON object`; the others emit the details above.
- Source (current code): in `execute`, `fs.Parse(args) != nil`, `fs.NArg() != 0` and a missing `--task` share one condition and the `usage` detail; in `api.DecodeTask`, `len(data) == 0 || data[0] != '{'` gives the JSON-object detail for empty and non-JSON input alike. `api.DecodeTask` does not change.
- Existing tests: `expectRefusal` in conformance/process_test.go checks only class, reason, exit and a non-empty detail, used by `TestVersionAndUsage` (`run` without `--task`) and `TestStrictTaskRefusal` (the `empty` task); none pins these details, so they stay valid.
- Addressed: wrong implementations named by the request are rejected by controls: the usage line kept as the missing-task detail, the extra argument not named, a flag error reported with the missing-task text, only zero-length input called empty, the standard-input wording used for a file, and non-JSON input called empty.
- Unchanged by request: usage line, version, capabilities, --help, unsupported_protocol, validateTask details, `cannot read the task:` detail, api.DecodeTask, stderr text.
- Build instructions for Go tests: add focused model-free tests in conformance/process_test.go next to `TestVersionAndUsage`, driving the built binary with `newWorld`, `startCLI` and `result()`, reading `r.first("error")["detail"]`, each also checking exit 2 and that no `session.started` event was emitted: TestRunWithoutATaskSaysWhatIsMissing (no arguments and `--task ""`), TestRunNamesTheExtraArgument (`run --task - extra` with a valid task on stdin, no request sent), TestRunFlagErrorIsTheDetail (`--bogus` and `--task` without a value), TestEmptyTaskOnStdinIsSaidToBeEmpty (empty, newline-and-spaces, and `this is x` keeping the JSON-object detail), TestEmptyTaskFileNamesTheFile (a task file `empty-task.json` holding a newline, written with os.WriteFile into `w.root`, given as `--task empty-task.json`).

## Tests
- Missing `--task` or an empty value says what is missing: TestRunWithoutATaskSaysWhatIsMissing in conformance/process_test.go next to TestVersionAndUsage (scenario)
- A leftover argument is named and no request is sent: TestRunNamesTheExtraArgument in conformance/process_test.go (scenario)
- A flag package error is the detail: TestRunFlagErrorIsTheDetail in conformance/process_test.go (scenario)
- Empty and whitespace-only standard input is called empty, other non-JSON keeps the JSON-object detail: TestEmptyTaskOnStdinIsSaidToBeEmpty in conformance/process_test.go (scenario)
- An empty task file is named in the detail: TestEmptyTaskFileNamesTheFile in conformance/process_test.go (scenario)
- Whole behavior through the built CLI: the acceptance scenarios (scenario)
- Existing refusal classes, exit codes and help/usage behavior stay green: TestStrictTaskRefusal and go test ./... (existing)

## Feasibility
- none
