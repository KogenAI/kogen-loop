# Sweep command groups and refuse foreign kills

Slug: k-safe-process-groups
Model: not applicable — no meaningful state machine; behavior is a process-group sweep option and a pure text filter, both pinned by real-process and table tests.
Acceptance:
- .kogen/intents/k-safe-process-groups/acceptance.feature
- features/steps/k_safe_process_groups.js
- features/steps/k_safe_process_groups_test.go.txt

This Build changes kogen-loop only (KOGEN-063, sections (a) and (b)). Kogen (probe wiring, other Kogen-run command sites, re-pin of `cli/third_party/kogen-loop`, `cli/loop-pin.json`, the configured-check variant of scenario 3) is a separate later Intent and is not edited here; this Intent only exposes the interface Kogen will use. Do not edit `.kogen/project.yaml`.

Why: a Shape probe once ended with `pkill -f beam.smp || true`, a pattern that matches other sessions' Erlang VMs. Today a command's group is killed only at its deadline, so background children outlive a normally ending command and the model learns to clean up by name.

### Interface (exact names, so Kogen and tests can rely on them)

In package `sys`:
- `Options.KillGroupOnExit bool` (default false). When true, `Session.Run`, after the command's leader has ended (normal exit, non-zero exit or after a fired timeout's own teardown), sends SIGTERM to the command's process group, polls like `Terminate` (100 ms steps, up to 5 s) and sends SIGKILL to what remains. Leaders that leave nothing behind cost nothing (ESRCH). The sweep must not set `TimedOut`, change `Status`, change `Output` or add an error; the deadline path and the interrupt paths are unchanged and no default timeout is added anywhere. When `Run` returns, the group has no member (the sweep waits for it).
- `Options.RefuseForeignKill bool` (default false). When true, `Run` calls `ForeignKill(command, s.Owned)` before starting anything; if refused, nothing starts, no group is recorded, and `Run` returns `Result{Status: 126, Output: RefusalText(rule), Rule: rule}` with a nil error and `TimedOut` false.
- `Result.Rule string`: the bounded rule identifier of a refusal, "" otherwise.
- `func ForeignKill(command string, owned func(pid int) bool) (rule string, refused bool)`: pure; the only implementation of the rule (Kogen must not copy it).
- `func RefusalText(rule string) string`: exactly `refused: this command would stop processes this run did not start (rule: <text>). Stop what you started with its own pid, for example kill $!, or its process group.` where `<text>` is `no pkill or killall; kill only pids this run created` for rule id `pkill-killall` and `kill only pids this run created` for rule id `kill-foreign-pid`.
- `func (s *Session) Owned(pid int) bool`: true when the pid, or its process group, is in `s.Groups()`, or the pid is a descendant of a process in one of those groups, judged live at the moment of the call. For a negative argument `-N` the check is on group `N`. Use native membership as in `timeout_observation_*.go` where it can answer, plus a parent-pid walk (`ps`-style) for descendants; it must work on Darwin and Linux.

The shell tool (`tools/tools.go` `shell`) sets `RefuseForeignKill: true` and does NOT set `KillGroupOnExit`: its description promises background dev servers survive between calls, and `loop.go` round cleanup and engine cleanup already end them with the round (say this in the review). On refusal it returns exactly `RefusalText(rule)` as ordinary tool text (no `exit status:` prefix, no Go error, run continues, next call works). The `Tools.Probe` seam is untouched. Tool definitions and the shell description text are NOT changed, so request bytes, transcripts and checkpoints stay compatible. The session's `tool.result` event (`loop/session.go`) gains one field `"rule"` (the bounded rule id) only when a shell call was refused; no extra command text is logged.

### Refusal rule (text filter, not a security boundary)

Simple tokenizer: split on `; & | ( ) \n`, handle quotes and backslash, inspect the first word of each simple command, also after the wrappers `sudo`, `xargs`, `exec`, `env` (and its `VAR=x` words), `command`, `nohup`, `timeout` (with its duration argument), `time`. Command words match by basename, so `/usr/bin/pkill` counts.
1. Rule `pkill-killall`: whole-word `pkill` or `killall` in command position (as above) refuses. Undecidable text (unterminated quote, `eval`, `$(...)` or backticks) is judged by: whole-word `pkill`/`killall` anywhere inside refuses; any other unknown stays allowed. Decided and pinned: `echo "do not pkill"` is refused (prefer false refuse); `grep -n pkill file` is allowed (argument, not command position); `pkillall` and `mypkill.sh` are not whole-word `pkill` and are allowed.
2. Rule `kill-foreign-pid`: `kill` or `/bin/kill` refuses when any non-signal-flag argument is a number the run did not create: owned check via the `owned` callback for a positive pid or negative `-N` group; `0` and `-1` always refuse; `kill $(pgrep ...)`, `kill $(pidof ...)`, `kill $(lsof ...)` and a pipeline of `pgrep`/`pidof`/`lsof`/`ps` into `xargs kill` refuse (by construction not known owned). Signal flags (`-9`, `-KILL`, `-s TERM`, `-TERM`) are not pids.
3. Allowed without a lookup: `kill $!`, `kill %N`, `kill $PID` where the same command text assigned `PID=$!`, and kill of a pid read from a file the same command text wrote with `$!`. Other `$VAR` arguments are undecidable and allowed. `pgrep -f x` and `ps aux` alone are allowed.
4. A bare numeric `kill 1234` is judged at call time against the live owned set (a real check): allowed for a child of an earlier call's still-living group, refused for an unrelated process.

The check is on command text before start. A refusal never ends the round, cancels the session or becomes a Go error.

Docs and code comment (in `docs/contract/loop-v1.md`, a README note and the `ForeignKill` comment): the sweep does not reach a process that left the group (`setsid`, own-session `nohup`, double-fork daemons, Gradle-style daemons); group kill is not a sandbox; the filter stops the model's habit, not a bypass (`eval "$(echo ... | base64 -d)"`, `sh -c "$VAR"`, `python -c 'os.kill'`, `find -exec kill`, a script file containing `pkill`, `busybox killall`, computed ids). Also state, in the docs only, what the Claude Code executor can and cannot enforce: Kogen kills `claude`'s group on cancel, Close and round end; a blocking PreToolUse hook on the `Bash` matcher using this function is possible but unverified and belongs to a separate item K-SAFE-2; Kogen cannot see or stop what `claude` runs between hooks or processes that leave the group.

## Decisions
- The sweep is opt-in via `Options.KillGroupOnExit`; the shell tool does not set it (source: request)
- Refusal is opt-in via `Options.RefuseForeignKill`, with one shared pure `sys.ForeignKill` that the shell tool enables (source: request)
- A refused shell call returns the exact `RefusalText` as tool text; a refused `Run` returns Status 126 with that text and `Rule` set (source: request)
- No shell description or request-byte change and no default timeout anywhere (source: request)
- Rule ids are `pkill-killall` and `kill-foreign-pid` (source: request)

## Source comparison
- (a) 1-5 group sweep, option default false, no TimedOut/Status/Output change, setsid limit: addressed by `KillGroupOnExit`, scenarios "group-exit", "deadline", "setsid", docs.
- (a) 2 Kogen sets the option at probe/check/setup/fix/git sites, and acceptance 3's "same for a configured check run through build.go": omitted here deliberately (Kogen side, separate Intent per request scope). Acceptance 1, 2 and 6 probe cases are covered through `Session.Run` with `RefuseForeignKill`, the function Kogen's probe will call; `verify.RunProbe` itself is Kogen side and omitted.
- (a) 3 shell tool does not set the option: addressed (scenarios group-exit `off`, own-kill two-call).
- (b) rules 1-5 and refusal shape 1-4: addressed by `ForeignKill`, `RefusalText`, `Owned`, shell tool, `Result.Rule`, event field `rule`; the event field is pinned by an integration test, not the feature. Status 126 and the rule ids are shaping choices.
- Acceptance 4 (own child kill, second shell call kill of printed pid) and 5 (setsid child, sweep does not error): feature scenarios. Acceptance 7 (`TestLoopPin`, vendored tree): Kogen side, omitted. Acceptance 7 tokenizer table (>=30 commands): unit test below. Acceptance 8 (checks green incl. `go test -race -count=1 ./...`) and 9 (no new timeout; only the two new options added): final verification and review.
- Request mention of `ProbeResult` and Kogen `verify.Probe.Run`: not in this repository; the Kogen Intent maps `Result` to it.
- Host safety: fixtures kill only their own pids; siblings are private uniquely named copies of `sleep` so name patterns cannot match other host processes.

## Tests
- Group sweep on normal exit, option off leaves child, output and status unchanged, deadline still times out, setsid child not reached without error: scenarios in acceptance.feature (scenario)
- Foreign pkill, killall, /usr/bin/pkill, kill pid and kill -9 pgid refused through `Session.Run` and the shell tool, sibling alive, next call works: Scenario Outline in acceptance.feature (scenario)
- Own-child kills (`kill $!`, `p=$!; kill -9 $p`) and kill of a pid printed by an earlier shell call: scenarios in acceptance.feature (scenario)
- `sys.ForeignKill` table with at least 30 commands, refused (`pkill -f x`, `sudo pkill x`, `xargs kill`, `kill $(pgrep x)`, `/usr/bin/killall x`, `kill -9 -1`, wrappers, `0`) and allowed (`grep pkill file`, `kill $!`, `kill %1`, `PID=$!; kill $PID`, `pgrep -f x`, `ps aux`, `pkillall`, `mypkill.sh`), with `echo "do not pkill"` pinned refused and the owned callback true or false for bare numeric and negative pids: new `sys/foreign_kill_test.go` (unit)
- `Session.Owned` for a started group's child, the group id, a descendant and an unrelated pid: new test in `sys` (integration)
- `Run` with `RefuseForeignKill` starts nothing and records no group on refusal, sets `Rule`, leaves `TimedOut` false: new test in `sys` (integration)
- Shell tool refusal text, and `tool.result` event carrying `rule` only for refused calls with the run not ended: new tests in `tools` and `loop` (integration)
- Existing sys, tools, loop and conformance behavior, including timeout custody and caller shell-bound, stays unchanged and `go test -race -count=1 ./...` passes: existing tests (existing)

## Feasibility
- The acceptance observer is lifecycle-sensitive, so its final bytes are qualified with known-good and known-bad controls. The fixture compiled (go vet) against a scratch copy with the two option fields and `Result.Rule` stubbed in; real behavior is unproven until the Build. (probe 1: exit 0; probe 2: exit 0)
- evidence: {"id":"ksafe-observer","kind":"observer","inputs":["features/steps/k_safe_process_groups.js","features/steps/k_safe_process_groups_test.go.txt"],"observers":["features/steps/k_safe_process_groups.js"],"checks":[{"name":"good","command":"node features/steps/k_safe_process_groups.js --control good","exit":0,"output":"k-safe observer good\n"},{"name":"bad","command":"node features/steps/k_safe_process_groups.js --control bad","exit":1,"output":"k-safe observer bad rejected\n"}]}
