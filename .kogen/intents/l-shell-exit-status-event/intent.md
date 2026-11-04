# Show a shell command's exit status in the run log

Slug: l-shell-exit-status-event
Model: not applicable — the field is a per-call copy of the completed command's status into that call's own tool.result event; no state is kept between calls and no rules interact
Acceptance:
- .kogen/intents/l-shell-exit-status-event/acceptance.feature
- features/steps/l-shell-exit-status-event__session.js

Today the `tool.result` event of a shell call (emitted by `Session.Round` in `loop/session.go`, so by `loop.Session` and `kogen-loop run`) carries `call_id`, `name`, `result_sha256`, `bytes`, `cut`, `shell_wait`, and `rule`/`error_kind`/`malformed_class` when they apply. Whether the command succeeded is visible only inside the text the model receives: the `exit status: N` first line of a completed new command, or `exit_status` in a retrieved completed JSON envelope. The log does not keep that text. A reader of the run log therefore cannot tell a passing check from a failing one, cannot count how many commands failed in a run, and cannot confirm a model's claim that a command failed without re-running it.

After this change, `tool.result` gains one additive field, `exit_status`. It is a JSON integer: the completed command's exit status, 128+signal when a signal killed it (`sys.Result.Status`). It is taken from the same `sys.Result` the delivered text is built from, never parsed back from the text.

Which results carry it (all other results never carry the key, not even as `null`):

- A new shell command (`{"command": ...}`) that completes within its wait. Its text is `exit status: <n>\n<output>`, and `exit_status` is `<n>`. For example `exit 0` gives `0`, `exit 3` gives `3`, and `echo l-ses-before-kill; kill -9 $$` (the shell killed by SIGKILL) gives `137`. A command that prints `exit status: 9` and exits 0 gives `0`.
- A retrieval (`{"handle": ...}`) that returns the completed JSON envelope `{"exit_status":<n>,"handle":...,"output":...,"status":"completed"}`. Its `exit_status` is that same `<n>`. A completed retrieval is repeatable until round end. Each call that returns the completed envelope describes the result it returned, so a later retrieval of the same completed handle carries `exit_status` again.

Which results never carry it:

- A new command whose 45-second wait elapsed while it was still running (`shell_wait.ended_by` is `handle_yielded`). The model receives the running envelope with a handle.
- A retrieval whose 30-second wait elapsed while the command was still running (`ended_by` is `bound`).
- A refused command: `sys.Result.Rule` is set and the event carries `rule` and `error_kind: "foreign_kill"`. This holds on both paths, even though `sys.Result.Status` is 126.
- A malformed shell call, such as no argument, both arguments or a non-string command.
- An unknown or expired handle.
- Calls ended by a done context or an interrupt (they have no `tool.result`), terminal calls, and every non-shell tool (`read_file`, `write_file`, `list_files`, `search_text`, `view_image`, `documentation`, `probe`).

`exit_status` is a number only. It never holds output text, and no other event gains output text: tool output stays out of the event stream. A non-zero `exit_status` is not a tool error. Such a result still carries no `error_kind` or `malformed_class`. Everything else stays byte-identical:

- what the model receives: shell texts, envelopes, the 16384-byte cut, definitions and request bodies;
- the transcript and `session.json`;
- the `tool.call` fields, which stay exactly `call_id`, `name` and `arguments_sha256`;
- every existing `tool.result` field (`result_sha256` and `bytes` still describe the delivered text) and every other event.

No option, flag, task field, `SessionConfig` field, capability or `api` constant is added. `loop.Run` emits no events and is unchanged.

Interface: `tools.Classified` gains `ExitStatus *int`. It points to the completed command's status exactly for the results listed above as carrying `exit_status` and is nil for every other result. `RunClassified` and `CallClassified` return it beside `ShellWait`. `tools.Output` and `Classified.Output()` do not change. `Session.Round` copies a non-nil `ExitStatus` into the call's `tool.result` as `"exit_status"`.

Update `docs/contract/loop-v1.md`:

- In the events table, add to the `tool.result` row: "`exit_status` (integer) only for a shell call that returns a completed command's result (see [Shell time limit](#shell-time-limit))".
- In "Shell time limit", after the sentence "Fast commands return `exit status: <n>\n<combined output>`" and the `shell_wait` paragraph, add a short note that states the rules above.
- In the note on exit-status texts under "Tool error kinds and malformed call classes" ("`exit status: N` texts, shell envelopes ... are not errors"), say that these results carry `exit_status` with the command's status, whatever its value, and still no `error_kind`.

The contract's rule for an additive v1 change asks for a contract note and a conformance fixture. Do not touch CHANGELOG.md.

## Decisions
- The `tool.result` event of a shell call whose command has completed gains the integer `exit_status` (128+signal when killed), taken from the same result the text is built from, not parsed from the text (source: request)
- No `exit_status` on the yielding `tool.result` (a handle was issued), on refused or malformed calls, unknown handles or non-shell tools. The retrieval that returns the completed result carries it (source: request)
- The field holds a number only, never output text. Nothing the model receives changes, and no other field, option or flag changes. The contract event table and the note on exit-status texts are updated (source: request)
- A refused command carries no `exit_status` even though `sys.Result.Status` is 126 for it, because the request excludes refused calls (source: request)

## Source comparison
- Addressed, Problem and Need: the additive `exit_status` field on `tool.result`, from `sys.Result.Status` through `tools.Classified.ExitStatus`. Both acceptance scenarios check the exact added fields through the built CLI.
- Addressed, Synthetic acceptance 1: `exit 0`, `exit 3` and `echo l-ses-before-kill; kill -9 $$` give `exit_status` 0, 3 and 137 (scenario "completed"). The shell tool runs `/bin/sh -c <command>`, so the command `exit 0` is `sh -c 'exit 0'`.
- Addressed, Synthetic acceptance 2: a command that waits for a release file outlives its 45-second first wait. Its yielding `tool.result` has no `exit_status`. The provider creates the release file when the running result reaches it, and the retrieval that returns the completed envelope carries `exit_status` 4. A second retrieval of the same handle carries 4 again, per the technical reading below (scenario "yield").
- Addressed, Synthetic acceptance 3: a refused command (`pkill -f ...`), an unknown handle, a malformed call and a `read_file` call carry no `exit_status` (scenario "completed").
- Addressed, Synthetic acceptance 4: `printf 'exit status: 9\n'` (exit 0) reports 0 (scenario "completed").
- Addressed, Synthetic acceptance 5: both scenarios check every text delivered to the model exactly. They check that `name`, `cut`, `result_sha256` and `bytes` of each `tool.result` describe that delivered text, that `tool.call` adds nothing, that `tool.result` adds exactly the expected fields (existing `shell_wait`, `rule`, `error_kind`, `malformed_class` included), and that no command output or file text appears anywhere on stdout. Request-body and transcript byte identity beyond the delivered outputs is covered by the existing goldens and `go test ./...` suites, which must keep passing.
- Decided here, technical reading of "Retrieval of a completed handle repeats it once, on the call that returns the completion": every call that returns a completed result carries `exit_status`, including a repeated retrieval of an already completed handle. The request ties the field to "a shell call whose command has completed", taken from the result the call's text is built from. The sentence names the completing retrieval as the carrier and adds no exception for repeated retrievals. No per-handle memory is added.
- Superseded: older completed acceptance drivers (`features/steps/l_shell_wait_instants.js`, `features/steps/l_tool_error_classes.js`) compare the exact `tool.result` field set of completed shell calls as it was before this change. They belong to finished Intents and are not run by this Intent's acceptance. The Build does not edit them.
- Decided here, technical: the public `tools.Classified.ExitStatus *int` field is the only interface addition. Repository Go tests that assert the exact `tool.result` field set of a completed shell call are updated to expect `exit_status`.

## Tests
- A new shell command that completes reports `exit_status` from its `sys.Result` (0, 3, 137 for SIGKILL, and 0 for output that prints `exit status: 9`): acceptance scenario "completed" through the built CLI, plus a new tools test (for example `tools/shell_exit_status_test.go`) through `RunClassified` checking `Classified.ExitStatus` with unchanged text (integration)
- A yielding command carries no `exit_status`, a retrieval that reaches its bound carries none, and the retrieval that returns the completed envelope carries it (again on a repeated retrieval): acceptance scenario "yield", plus the tools test on controlled time with `Tools.ShellAfter` covering yield, bound and completed retrievals (integration)
- Refused commands, malformed shell calls, unknown handles and non-shell tools carry no `exit_status`: acceptance scenario "completed", plus the tools test (`ExitStatus` nil) (integration)
- `loop.Session` emits `exit_status` on exactly these `tool.result` events: a new conformance test (for example `conformance/shell_exit_status_test.go`) using the existing fake provider and `loop.NewSession`, the conformance fixture the contract requires (integration)
- Nothing the model receives changes, `tool.call` and the other `tool.result` fields stay as they are, and no output text reaches the event stream: both acceptance scenarios (scenario)
- Shell texts, envelopes, cuts, request-body goldens, transcripts, `shell_wait`, error classes and `loop.Run` keep their behavior: the existing `go test ./...` suites keep passing, with exact `tool.result` field-set assertions of completed shell calls updated for `exit_status` (existing)

## Feasibility
- Repository inspection: `tools.(*Tools).shell` in `tools/tools.go` builds both completed texts from `res.Status` of `j.cmd.Snapshot()`: `exit status: N` for a new command and `envelope["exit_status"]` for a retrieval. `sys.exitStatus` gives 128+signal for a signalled process. `Session.Round` in `loop/session.go` already copies `Classified.ShellWait` into `tool.result` in the same way the new field needs. No external protocol, provider or library fact is involved, so no documentation lookup was needed.
- Scratch run of the submitted driver against the unchanged CLI (HEAD 51a7fd3, Go 1.27.2, Node 24.21.0). Scenario "completed" (1.9 s) delivered exactly the expected texts (`exit status: 137\nl-ses-before-kill\n` for the SIGKILL command, `exit status: 0\nexit status: 9\n` for the printed one). Scenario "yield" (45.1 s) yielded after the 45-second wait with `ended_by` `handle_yielded`, and both retrievals returned the completed envelope with `exit_status` 4. Every digest matched and nothing leaked. Only the tool-events step failed, for the missing `exit_status` fields: legitimate missing-feature red.
- evidence: {"id":"shell-exit-status-observer","kind":"observer","inputs":["features/steps/l-shell-exit-status-event__session.js"],"observers":["features/steps/l-shell-exit-status-event__session.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/l-shell-exit-status-event__session.js --control good","exit":0,"output":"shell exit status observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/l-shell-exit-status-event__session.js --control bad","exit":1,"output":"shell exit status observer rejected\n"}]}
