# Record each tool call's own execution time

Slug: l-tool-result-elapsed
Model: not applicable — the field is a per-call measurement copied into that call's own tool.result event; nothing is kept between calls and no rules interact
Acceptance:
- .kogen/intents/l-tool-result-elapsed/acceptance.feature
- features/steps/l-tool-result-elapsed__session.js

Today `tool.result` events (emitted only by `Session.Round` in `loop/session.go`, so by `loop.Session` and `kogen-loop run`) carry `call_id`, `name`, `result_sha256`, `bytes`, `cut`, and `rule`, `shell_wait`, `exit_status`, `error_kind`, `malformed_class`, `omitted_lines` or `recovers` when they apply. None of them says how long the call ran. Event `time` is RFC 3339 with whole seconds, and only shell calls that reach their wait carry `shell_wait` instants. So for read, write, list, search, probe, documentation and image calls the run log cannot say how long the call took, and a run's tool time cannot be separated from provider and idle time.

After this change every `tool.result` event gains one additive field, `elapsed_ms`: a JSON integer, the wall time in whole milliseconds (`time.Duration.Milliseconds()`, truncated) from the moment the session starts running that call to the moment its output is complete. It is measured before the cut and before anything else the round does with the output.

Where it is measured: in `Session.Round`'s `HandleCall` hook, a clock reading taken immediately before `s.tools.CallClassified(ctx, call)` and another taken right after it returns, before `Output.Cut`. `AfterCall` writes the difference as `"elapsed_ms"` on that call's `tool.result`. Every non-terminal call of a `loop.Session` has a `tool.result` and carries `elapsed_ms`: completed, yielded and refused shell calls, malformed calls of any tool, unknown or disabled tool names, unknown shell handles, tool errors and every tool (`read_file`, `write_file`, `list_files`, `search_text`, `view_image`, `documentation`, `probe`, `shell`). A refused or malformed call reports its small real value, or 0 when the clock did not move. Terminal calls still have no `tool.result`. A call ended by a done context or an interrupt still returns its error with no `tool.result`.

The clock seam. `tools.Tools` (tools/tools.go) gets one exported field, declared directly after `ShellAfter`:

```go
Now func() time.Time
```

- Nil (the zero value; the CLI, `loop.Session` and every existing caller): the tools and the session read `time.Now`, exactly as today.
- Non-nil: it is the clock of both measurements that tests need to control. The shell-wait record's `WaitStarted` and `WaitEnded` (the two `time.Now()` calls in `(*Tools).shell`) read `Now`. `Session.Round` reads `s.tools.Now` for both readings of each call's `elapsed_ms`. The session reads the field from its `*tools.Tools` (the existing unexported `Session.tools` field) each time it runs a call, never a copy taken when the session was built, so a test that sets `s.tools.Now` after `NewSession` controls it.
- `ShellWait.Spawned` stays the process start instant from `sys` (`j.cmd.Started()`), and its existing "not started by the wait's end" rule is unchanged. The event `time` of every event stays `time.Now()` in `Session.emit`. Provider and request timing are untouched.
- Its doc comment says that it is a test seam, that production leaves it nil and uses `time.Now`, and that the `shell_wait` wait instants and the session's `elapsed_ms` read it. It is not a CLI flag, task field, `SessionConfig` field, config key, environment variable or capability.

`elapsed_ms` is a number only. It never holds arguments, paths or contents, and no event gains any of them. Everything else stays byte-identical:

- what the model receives: tool results and texts, the cut, definitions, request bodies;
- the transcript and `session.json`;
- `tool.call`, which keeps exactly `call_id`, `name` and `arguments_sha256`;
- every existing `tool.result` field: `shell_wait` keeps its exact four keys and format, `exit_status` stays, and `result_sha256` and `bytes` still describe the delivered text;
- every other event and its fields.

No option, flag, task field, `SessionConfig` field, capability or `api` constant is added. `loop.Run` emits no events and is unchanged, including its overlap of unhooked calls.

Update `docs/contract/loop-v1.md`:

- In the events table, add to the `tool.result` row, after `` `cut` (bool), ``: `` `elapsed_ms` (integer, every result), ``.
- Add one line directly after the table (before "`session.ended` is always the last line."), for example: "`elapsed_ms` is the wall time in whole milliseconds from the moment the session starts running the call to the moment its output is complete (before the cut); it is measured with `Tools.Now`, a test seam that production leaves nil (`time.Now`) and that the `shell_wait` wait instants also read; it holds a number only." The line must name both `` `elapsed_ms` `` and `` `Tools.Now` ``.

The contract's rule for additive v1 changes asks for a contract note and a conformance fixture. Do not touch CHANGELOG.md.

## Decisions
- Every `tool.result` event gains the additive integer `elapsed_ms`: wall time in whole milliseconds from the moment the session starts running that call to the moment its output is complete, before the cut and before waiting for sibling calls (source: request)
- It is measured with the same clock seam the shell-wait record uses, so tests can control it (source: request)
- It records a number only: no arguments, paths or contents (source: request)
- Shell calls keep `shell_wait` unchanged and also carry `elapsed_ms`. Nothing the model receives, no other event field and no option or flag changes (source: request)
- A refused or malformed call reports `elapsed_ms` of 0 or its small real value, never a missing field. A terminal call still has no `tool.result` (source: request)
- The `tool.result` row of the contract event table lists the field, with a one-line note (source: request)

## Source comparison
- Addressed, Need: the `elapsed_ms` field and the `HandleCall` measurement above. Scenario "CLI" checks through the built CLI that every one of 11 `tool.result` events (two shell calls in one response, then read, write, list, search, image, documentation, refused shell, malformed shell and unknown tool in one response) carries exactly the old fields plus a non-negative integer `elapsed_ms`.
- Addressed, Need "measured with the same clock seam the shell-wait record uses, so tests can control it": no clock seam exists today. The shell-wait instants call `time.Now()` directly, and `Tools.ShellAfter` is a timer seam that cannot measure time. Decided here (technical): add one test seam `tools.Tools.Now` that both the shell-wait wait instants and the session's `elapsed_ms` read. Scenario "injected clock" proves both read it: the refused shell call's `wait_started` and `wait_ended` are the injected instant `2026-11-05T10:00:01.400000000Z`. Nil keeps production identical.
- Addressed, Synthetic acceptance 1: in scenario "injected clock", two probe calls in one response advance the injected clock by 200 ms and 1200 ms while they run and report `elapsed_ms` 200 and 1200 exactly. These are not equal to each other and not the gap between event times, which stay whole seconds of the real clock. Scenario "CLI" runs `sleep 0.2` and `sleep 1.2` as two shell calls in one response on the real clock: their `elapsed_ms` are at least 200 and 1200 and each fits within its own tool.call/tool.result event seconds.
- Clarified, Problem "Calls from one response run in parallel ... published ... only after every call finished": that describes unhooked `loop.Run` (the overlap stage), which emits no events. `loop.Session` installs call hooks, so its calls run one after another and each `tool.result` follows its call. The gap between event times still cannot give a duration because event `time` has whole-second resolution. The field's definition is the same either way, and no execution order changes.
- Addressed, Synthetic acceptance 2: on the injected clock the refused shell call, the malformed shell call, the unknown tool and `read_file` report exactly 0. On the real clock (scenario "CLI") the refused, malformed and unknown calls and the other non-shell calls report an integer below 5000. Both scenarios check that the `finish` call has a `tool.call` and no `tool.result`.
- Addressed, Synthetic acceptance 3: the CLI shell calls keep `exit_status` 0 and a four-key `shell_wait` with nine-digit instants and `ended_by` `exit`, and the refused call keeps `spawned` null, `rule` and `error_kind`. Each shell call's `elapsed_ms` is at least its `wait_ended - wait_started` (1 ms tolerance).
- Addressed, Synthetic acceptance 4: both scenarios check every text delivered to the model exactly, that `name`, `cut`, `result_sha256` and `bytes` describe it, that no request body mentions `elapsed_ms`, that `tool.call` adds nothing, and that every other event type carries exactly its current fields with whole-second times of the real run. Request-body and transcript byte identity beyond that is covered by the existing goldens and `go test ./...`, which must keep passing.
- Addressed, Synthetic acceptance 5: both scenarios check that no event contains the fixture file names or texts (all start with `l-tre-`), the shell command text (`sleep`) or the run's root directory.
- Addressed, contract table: scenario "contract" checks the `tool.result` row lists `` `elapsed_ms` (integer `` and that a line outside the table names `` `elapsed_ms` `` and `` `Tools.Now` ``.
- Superseded: older completed acceptance drivers (for example `features/steps/l-shell-exit-status-event__session.js`, `features/steps/l_shell_wait_instants.js`, `features/steps/l_tool_error_classes.js`, `features/steps/l-cut-recovery-observability__session.js`) compare the exact `tool.result` field set as it was before this change. They belong to finished Intents and are not run by this Intent's acceptance. The Build does not edit them.
- Decided here, technical: `loop/tool_overlap_compat_test.go` ("no new public field") lists the fields of `tools.Tools`. Its list becomes `Root, Session, Repo, Enabled, Protected, Excluded, Probe, Documentation, ShellAfter, Now, shells`. Repository Go tests that assert an exact `tool.result` field set are updated to expect `elapsed_ms`.

## Tests
- Every `tool.result` of a `loop.Session` carries an integer `elapsed_ms` beside its unchanged fields, for every tool and for refused, malformed and unknown calls, and terminal calls have none: acceptance scenario "CLI" through the built CLI, plus a new conformance test (for example `conformance/tool_result_elapsed_test.go`) through `loop.NewSession` with the existing fake-provider style, the conformance fixture the contract requires (integration)
- `elapsed_ms` is the call's own time on the controlled clock (200 and 1200 ms for two calls in one response, 0 for refused, malformed and unknown calls and reads while the clock stands still): acceptance scenario "injected clock", plus a new internal test in package loop (for example `loop/tool_result_elapsed_test.go`) that sets `s.tools.Now` like `loop/shell_wait_event_test.go` sets `ShellAfter` (integration)
- The shell-wait record's `WaitStarted` and `WaitEnded` read `Tools.Now` when set, and `time.Now` when nil: a new tools test through `RunClassified` with `Now` set, for example on a refused command, checking `Classified.ShellWait` (integration)
- `tools.Tools` gains exactly the field `Now` after `ShellAfter`: update the field list in `loop/tool_overlap_compat_test.go` (unit)
- Shell calls keep `shell_wait` and `exit_status`, nothing the model receives changes, and no path, argument or file text reaches the event stream: acceptance scenarios "CLI" and "injected clock" (scenario)
- The contract's `tool.result` row lists `elapsed_ms` and a note names `Tools.Now`: acceptance scenario "contract" (scenario)
- Request-body goldens, transcripts, shell texts and envelopes, cuts, error classes, cut recovery and `loop.Run` keep their behavior: the existing `go test ./...` suites keep passing, with exact `tool.result` field-set assertions updated for `elapsed_ms` (existing)

## Feasibility
- Repository inspection (HEAD 44357d5): `loop.Session` runs each call in its `HandleCall` hook through `s.tools.CallClassified` and emits `tool.result` from `AfterCall`, where `shell_wait` and `exit_status` are copied the same way the new field needs. `(*tools.Tools).shell` reads `time.Now()` for `WaitStarted` and `WaitEnded`. `Session.emit` stamps whole-second `time`. Conformance goldens match events as subsets, so extra keys do not break them. No external protocol, provider or library fact is involved, so no documentation lookup was needed.
- Scratch run of the submitted driver's CLI fixture against the unchanged CLI (Go 1.27.2, Node 24.21.0): the 11 delivered texts are exactly the feature's, every digest matched, no event contained a fixture path, command or file text, no request body mentioned `elapsed_ms`, and only `elapsed_ms` was missing (legitimate missing-feature red). The same fixture with plausible `elapsed_ms` values added to the real unchanged-CLI events was accepted by the observer. The harness ran and passed as a test of package loop in a private copy of the unchanged tree. It reported `tools.Tools has no field Now` and no `elapsed_ms`, and everything else matched.
- evidence: {"id":"tool-result-elapsed-observer","kind":"observer","inputs":["features/steps/l-tool-result-elapsed__session.js"],"observers":["features/steps/l-tool-result-elapsed__session.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/l-tool-result-elapsed__session.js --control good","exit":0,"output":"tool result elapsed observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/l-tool-result-elapsed__session.js --control bad","exit":1,"output":"tool result elapsed observer rejected\n"}]}
