# Run the last shell-wait tests on controlled time

Slug: l-shell-wait-seam-rest
Model: not applicable — only tests change; the shell call's states (started, running, yielded, retrieved, completed, cancelled), its handles and round cleanup are unchanged, and production code is not edited
Acceptance:
- .kogen/intents/l-shell-wait-seam-rest/acceptance.feature
- features/steps/l_shell_wait_seam_rest.js

L-SHELL-WAIT-SEAM-REST in kogen-loop. L-SHELL-WAIT-SEAM (b099dfa) added the test-only controlled-time seam `tools.Tools.ShellAfter func(wait time.Duration) <-chan time.Time` and moved five tests onto it. Three tests still wait out the real 45-second shell wait in every subtest: `conformance.TestShellLifecycleYieldSnapshot` (8 subtests, explicit|implicit × hook|no_call|requester|terminal, 47.2 s each), `tools.TestShellYieldLargeJSON` (subtests 16383, 16384, 16385, 200000, 45.0 s each) and `tools.TestShellRetrievalCancellationStopsCommand` (subtests cancel and deadline, 47.1 s each). After this change these three tests set `ShellAfter` on the `tools.Tools` they already use and drive the shell wait on controlled time. They still run real processes through the real yield, snapshot, large-output and cancellation paths. Each still fails on a deliberately broken implementation, and no test in the suite waits out the real shell wait.

**Scope.** Only `tools/shell_yield_test.go` and `conformance/shell_yield_snapshot_test.go` change. The existing helpers in `tools/shell_after_test.go` (`newShellClock`, `shellClock.After`, `next`, `appears`, `captured`, `callShell`, `held`, `finished`) are reused. The conformance test builds its `ShellAfter` inline, the way `TestShellLifecycleHandleRetrieval` does. There is no second seam: no other field, hook, clock, environment variable, flag, task field or config key is added. No production file changes (`api/`, `cmd/`, `internal/`, `loop/`, `provider/`, `sys/`, `tools/` non-test files), and neither do `docs/contract/loop-v1.md`, the README or CHANGELOG.md. The 45-second and 30-second waits stay as they are. The `discarded` subtest of `TestShellLifecycleYieldSnapshot` and every other test stay unchanged.

**The three tests.** Each keeps every assertion it makes today, and gains the checks named below:
- `tools.TestShellYieldLargeJSON`, each of the subtests `16383`, `16384`, `16385`, `200000`:
  - The command becomes `head -c <n> /dev/zero; : > ready; while [ ! -f release ]; do sleep .05; done`.
  - The new command asks `ShellAfter` for exactly 45 s. The test fires that wait only after `ready` exists and the session has captured exactly n output bytes (`appears`, `captured`).
  - After `release` is written, the retrieval asks for exactly 30 s and returns on completion without its wait being fired.
  - Kept: both envelopes are valid JSON of at most `maxResult` (16384) bytes, the first has status `running` with a handle, the retrieval has status `completed`.
- `tools.TestShellRetrievalCancellationStopsCommand`, subtests `cancel` and `deadline`:
  - The new command `echo $$ > actor.pid; exec sleep 600` asks for exactly 45 s. That wait is fired only after `actor.pid` exists, and the yield is `running` with a nonempty handle.
  - The retrieval through `RunContext` asks for exactly 30 s, and that wait is never fired. Only the cancellation (cancel) or the context deadline (deadline) ends it.
  - The existing 2-second cancel timer and 2-second `context.WithTimeout` stay unchanged.
  - Kept: `errors.Is(err, context.Canceled)` or `context.DeadlineExceeded`, the bound that it returns within 7 s, and that the recorded pid is gone (`ESRCH`).
  - Note: the 30-second request is already queued on the clock when `RunContext` returns, so it can be checked after the call returns. Do not call `t.Fatal` from another goroutine.
- `conformance.TestShellLifecycleYieldSnapshot`, its 8 explicit/implicit subtests:
  - The round's `l.rd.Tools.ShellAfter` is set before the `implicit` case clears `Session`. `loop.Run` copies the `Tools`, so the copy keeps the field.
  - The first shell wait (call `c1`) must be exactly 45 s; otherwise the test records an error. It is fired only after `writer.pid` holds a pid and `writes` is nonempty.
  - Every later wait (the hook ending's `c2` command `true`) gets a channel that never fires.
  - Kept: the running yield with a handle, the writer alive at yield, the sentinel or ending identity, nothing of the writer or its group alive at return, no transient at return, `git add -A -- .` succeeding, and the 2-second post-return observation in which the transient never reappears and `writes` never advances.

A test fires a controlled wait only after the command has observably produced what the following assertion expects. The tests do not sleep to let real time pass; short polling for files a command writes is fine. No assertion is removed or loosened, and no timeout or limit is raised (the existing 10-second helper bounds, the 7-second bound and the 2-second timers stay). All cases stay synthetic: local processes and scripted providers, no paid calls. Each of the 14 subtests passes within 10 s. Under each deliberately broken implementation of the acceptance, each fails by its own assertion within 10 s, never by a timeout.

**Mutation anchors.** The acceptance builds broken implementations in private copies of the tree by replacing these existing lines. Each must stay verbatim and occur exactly once in its file, and comments must not repeat them. The change needs none of them edited:
- In tools/tools.go:
  - `if len(raw) > maxResult {` (unbounded envelope)
  - `if len(b) <= maxResult {` (escaping ignored)
  - the three lines `case <-done:` / `j.cancel()` / `<-j.cmd.Done()` of the shell wait's select (cancel keeps command)
- In loop/loop.go: `defer custody(rd.Tools.Session)()` and `defer rd.Tools.EndShellRound()` (no round cleanup)

**Acceptance harness.** Kogen runs the whole acceptance under a 120-second limit, on the unchanged tree too, so the step file bounds every `go test` run:
- A watchdog stops the run once any test without subtests has run longer than the scenario's limit: 10 s for the broken copies, 30 s for the whole suite. The stopped run is reported as a failure.
- Every run gets a private temporary directory as both `TMPDIR` and `GOTMPDIR` (this Go roots `t.TempDir` in `GOTMPDIR`). When the run ends, every process still working in that directory is killed. A test binary stopped mid-test cannot run its own cleanups, and its writer loops would otherwise keep running.
- The four broken copies run concurrently.

**Report.** The Build reports, on the same host and at the same load, run back to back:
- the wall time of `go test -count=1 -json ./...` on the base commit b80483b (in a separate copy, for example extracted with `git archive`) and on the candidate tree;
- the `Elapsed` of every subtest of the three tests in both runs;
- every test or subtest still over 5 s in the candidate run, each with its reason.

## Decisions
- The three tests use the existing seam `tools.Tools.ShellAfter` from b099dfa. No second seam and no user-visible option is added. (source: request)
- Each test still exercises the real yield, snapshot, large-output and cancellation paths, and still fails on a deliberately broken implementation. (source: request)
- No test in the suite waits out the real shell wait. Every remaining test over 5 s is listed with its reason. (source: request)
- No assertion is weakened, no timeout or limit is raised, cases are synthetic only, and before/after suite wall time is reported. (source: request)

## Source comparison
- Addressed, Problem: the measured figures are motivation, not thresholds:
  - MacBook, 2 Nov 11:55Z, `go test -json` of ./tools ./conformance on b099dfa: suite 118 s (tools 97 s, conformance 118 s), with the three tests' subtests at 47.2 s, 45.0 s and 47.1 s.
  - Reproduced in a scratch copy of b80483b (same production tree as b099dfa): `go test -count=1 -json ./...` took 118.9 s wall (conformance 117.8 s, tools 98.0 s), with the same 14 subtests at 45.0–47.2 s.
  - The request's "about 15 s" is an estimate, not an acceptance threshold. The acceptance instead requires, in one whole-suite run, each of the 14 subtests to pass within 10 s and no test to take 30 s or more.
- Addressed, Need "same seam ... no second seam ... no user-visible option": the Scope paragraph. Only two test files change. Review checks that no production, documentation or configuration file changes.
- Addressed, Need "still exercises ... Each catches the same defect as before: show that a deliberately broken implementation still fails it": the mutation scenario breaks four private copies concurrently. Every listed subtest must fail by its own assertion within 10 s, with no watchdog stop or `go test` timeout:
  - `no round cleanup` → the 8 YieldSnapshot subtests
  - `unbounded envelope` and `escaping ignored` → the 4 LargeJSON subtests
  - `cancel keeps command` → both cancellation subtests
  Each mutation also fails the unchanged test on b80483b, after 45–47 s (see Feasibility), so these are defects the tests caught before.
- Addressed, Need "No test in the suite waits out the real shell wait anymore. List any remaining test over 5 s with its reason":
  - The whole-suite scenario runs `go test -count=1 -json -timeout 100s ./...` once. The watchdog stops any test running over 30 s. The scenario requires the 14 subtests to pass within 10 s, the three tests and the five b099dfa tests to pass, no stop, timeout or build failure, and no test or subtest to take 30 s or more. A test that waited out the real 30-second retrieval wait or 45-second new-command wait would take at least 30 s.
  - Unrelated tests are not required to pass there; the configured go-test check covers them.
  - The over-5-s list is a Build report obligation. In the scratch candidate these were TestShellLifecycleDeadlineStartup (12.8–16.4 s), TestCallerShellBoundCustody/exits and /ignores (about 6 s), TestTimeoutCustodyBlockedObservation/context and /interrupt (5.2–9.4 s), TestShellLifecycleKilledHostDescendants/finished_shell and /running_shell (about 5.4 s) and TestInterruptKillsAGroupThatIgnoresSIGTERM (5.1 s). None of them is a shell wait.
- Addressed, Need "Never weaken an assertion; never raise a timeout or limit; synthetic cases only": the kept-assertion list per test above. The acceptance's watchdog limits are acceptance bounds, not product or test timeouts.
- Addressed, Need "Report before/after suite wall time": the Report paragraph. This is not executable acceptance, because equal host load cannot be asserted.
- Evidence, MacBook <checkout>/logs go test -json on b099dfa: motivation only; not available in this checkout.
- Omitted deliberately: production or documentation changes, Kogen changes, CHANGELOG.

## Tests
- The three tests run on controlled time through `Tools.ShellAfter`, ask for exactly 45 s and 30 s, keep their assertions, and each subtest passes within 10 s: restate `tools.TestShellYieldLargeJSON`, `tools.TestShellRetrievalCancellationStopsCommand`, `conformance.TestShellLifecycleYieldSnapshot`; first Then of the acceptance whole-suite scenario (integration)
- Each of the three still fails on a deliberately broken implementation, by its own assertion within 10 s: acceptance scenario `Each remaining shell-wait test still fails on a deliberately broken implementation` (regression)
- No test in the suite waits out the real shell wait: second Then of the acceptance whole-suite scenario (integration)
- Production keeps the real 45-second wait and the 30-second retrieval: existing l-shell-wait-seam and l-bounded-shell-wait acceptance, `tools.TestShellNewCommandCompletesWithinBound`, `tools.TestShellNewCommandCancellationStopsCommand` (existing)

## Feasibility
- Repository inspection: the only shell timer is chosen in `(*Tools).shell` (tools/tools.go), which uses `ShellAfter` when it is set, with the fixed `45 * time.Second` and `30 * time.Second`. `loop.Run` copies `Tools` (keeping `ShellAfter`) for implicit sessions, and defers `custody` and `EndShellRound`. No external protocol, library or provider is involved, so no documentation lookup was needed.
- Base run: scratch copy of b80483b, `GOMAXPROCS=4`, `go test -count=1 -json ./...`: 118.9 s wall. Subtests: YieldSnapshot 47.2 s × 8, LargeJSON 45.0 s × 4, RetrievalCancellation 47.1 s × 2.
- Mutations against the unchanged tests (scratch copies of b80483b):
  - `unbounded envelope`: LargeJSON 4/4 fail at 45.1 s, "invalid envelope length 98374…1200076".
  - `escaping ignored`: LargeJSON 4/4 fail at 45.1 s. An earlier replacement `if mid <= maxResult {` did not compile (unused `b`), hence `if len(b) >= 0 {`.
  - `cancel keeps command`: 2/2 fail at 47.1 s, "command still exists".
  - `no round cleanup`: all 8 subtests fail at about 45 s with "writer alive at return".
- Previous round: readiness reported the 120-second acceptance limit exceeded, because the unchanged tree took about 8 minutes. Runs cut off by a `go test` timeout or a kill had left `TestShellLifecycleYieldSnapshot` writer loops running in `GOTMPDIR` (`<checkout>/gotmp`), which motivates the harness above. A `TMPDIR`-only reaper missed them: this Go roots `t.TempDir` in `GOTMPDIR`. The good control now checks by pid that the process left by a stopped test is gone, and fails when the reaper uses `TMPDIR` only.
- Scratch restatement (not submitted) of the three tests as specified above:
  - Their subtests passed in 0.07–2.3 s, and the whole suite took 33.7–45.1 s wall.
  - The four mutations failed every listed subtest in 0.1–2.1 s by their own assertions.
  - The submitted acceptance passed both scenarios on that restatement in 60 s. It failed both on b80483b in 63 s: the watchdog stopped each run at its limit, and no process was left behind.
- One whole-suite run during acceptance exited 1 from an unrelated intermittent failure, and an earlier scratch run had `sys.TestInterruptStopsAndRefuses` fail with "interrupted group remains: operation not permitted". Two more candidate suite runs passed fully. The whole-suite scenario does not depend on unrelated tests passing.
- evidence: {"id":"shell-wait-seam-rest-observer","kind":"observer","inputs":["features/steps/l_shell_wait_seam_rest.js"],"observers":["features/steps/l_shell_wait_seam_rest.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/l_shell_wait_seam_rest.js --control good","exit":0,"output":"shell wait seam rest observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/l_shell_wait_seam_rest.js --control bad","exit":1,"output":"shell wait seam rest observer rejected\n"}]}
