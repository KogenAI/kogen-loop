# Refuse non-string shell command even with a handle

Slug: shell-invalid-command-with-handle
Model: not applicable — the shell argument check is a stateless function of the call arguments
Acceptance:
- .kogen/intents/shell-invalid-command-with-handle/acceptance.feature
- features/steps/shell-invalid-command-with-handle__steps.js
- features/steps/shell-invalid-command-with-handle__driver/driver_test.go.txt

The shell tool currently refuses a supplied non-string `command` only when no usable handle is supplied, so a call with a numeric command and a valid handle proceeds as a handle lookup and silently ignores the malformed command. After this change a supplied `command` whose value is not a string is refused even when a handle is also supplied. The refusal names `command` and is classified as a wrong argument type (the existing `error: argument command must be a string` text and `wrong_argument_type` class). Handle selection, shell execution and other tools' argument handling are unchanged. The edit is confined to tools/tools.go and tools/shell_empty_handle_test.go.

## Decisions
- A supplied shell `command` that is not a string is refused with the existing text `error: argument command must be a string` and the existing wrong-argument-type class regardless of whether a handle is supplied, so the refusal names command and no handle lookup happens. (constraint: the refusal is not applied only when a handle is absent; it is not turned into a conflicting-arguments or missing-argument refusal) (evidence: tools/tools.go; tools/shell_empty_handle_test.go) (source: request)
- A valid command with a missing, null, empty, whitespace or non-string handle keeps its current behavior and starts the command. (decision: D2, round 1) (constraint: a non-string handle is never rejected by itself) (evidence: tools/tools.go; tools/shell_empty_handle_test.go) (source: request)
- A valid handle without a command still retrieves that handle, and a valid command without a handle still starts a command; neither single-input form is treated as conflicting. (decision: D3, round 1) (evidence: tools/tools.go) (source: request)
- Acceptance drives the real Tools.RunClassified through a Go test driver supplied with go test -overlay (not committed into tools), so no test name has to be invented by the Build. The driver first starts a long command to obtain a real handle, substitutes it for the literal `$HANDLE` in the call arguments, and prints the refusal class and text. (decision: D4, round 1) (evidence: tools/tools.go; tools/shell_yield_test.go; features/steps/foreign-kill-busybox-applet__steps.js) (assumption: the driver forces the wait to yield through the Tools.ShellAfter seam, observed only in a scratch copy of the checkout) (source: request)
- A supplied non-string shell command is refused with the existing wrong-argument-type text and class even when a handle is supplied. (decision: D1, round 1) (evidence: tools/tools.go; tools/shell_empty_handle_test.go) (assumption: Probes ran only in a scratch copy of the checkout (go test with overlay driver); they are not retained as Kogen evidence.) (source: request)

## Source comparison
- Numeric command with a valid handle refused as wrong argument type naming command: addressed by the first two scenarios of acceptance.feature (source: request).
- Valid command with missing, null, empty or non-string handle retains behavior: addressed by the command scenarios with no, null, empty, numeric and boolean handles (source: request).
- Valid handle alone still retrieves; valid command alone still starts: addressed by the handle-only scenario and the no-handle command scenario (source: request).
- Changing handle selection, shell execution or other tools' argument handling: omitted, out of scope (source: request).

## Tests
- numeric command with a valid handle is refused as a wrong argument type naming command: add a case with a real running handle to TestShellEmptyHandleSelection in tools/shell_empty_handle_test.go, asserting text and wrong-argument-type class via RunClassified (unit)
- valid command with missing, null, empty or non-string handle and handle-only retrieval keep their behavior: existing cases of TestShellEmptyHandleSelection (existing)
- end-to-end refusal and preserved selection through the shell tool: .kogen/intents/shell-invalid-command-with-handle/acceptance.feature (scenario)

## Feasibility
- none
