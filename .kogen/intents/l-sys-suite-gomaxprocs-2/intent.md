# Stop busy sys fixtures starving 2-CPU hosts

Slug: l-sys-suite-gomaxprocs-2
Model: not applicable — a test-only synchronization fix: three tests change how they wait and what they burn, no product state or transition changes
Acceptance:
- .kogen/intents/l-sys-suite-gomaxprocs-2/acceptance.feature
- features/steps/l-sys-suite-gomaxprocs-2__suite.js

On the 2-vCPU Linux Build host (GOMAXPROCS=2), `TestRunKillGroupOnExit` and other sys suite tests time out or miss their deadline; the same tests pass on the Macs. A test that only passes with many CPUs hides a real race or a wait that assumes a fast scheduler. After this change, the following pass and the full suite still passes at the default GOMAXPROCS:

- `GOMAXPROCS=2 go test ./sys/... -count=5`
- `GOMAXPROCS=2 go test -race ./sys/...`
- `TestRunKillGroupOnExit` at GOMAXPROCS=2

The cause is fixed: each test waits on the event it needs instead of a fixed sleep or a deadline that assumes spare CPUs. Raising a timeout, deadline, retry count or iteration limit is not a fix, and no existing one is raised.

The cause, found in the code (the commit subject above names it):

1. The sys suite's own fixtures occupy both CPUs of a 2-CPU host while its other tests run against 1 to 10 s deadlines.
   - `TestLinuxTimeoutObservationChurn` (`sys/linux_timeout_observation_linux_test.go`, Linux only, so the Macs never run it) calls `t.Parallel()` and runs for a fixed 20 s wall-clock window (`deadline := time.Now().Add(20 * time.Second)`). Three goroutines run `/bin/true` back to back and the main goroutine scans `/proc` back to back. Every other parallel sys test waits on its deadlines during those 20 s. Under `go test ./...`, the contract package runs next to it.
   - `TestTimeoutCustodyBlockedObservation` and `TestTimeoutCustodyObservationError` (`sys/timeout_custody_liveness_test.go`) run their shell fixture as the busy loop `while :; do :; done`. In the blocked test, the two spinning shells live until the 5 s SIGKILL escalation. Measured here: that test alone used 10.69 s of user CPU in 6.67 s of wall time at GOMAXPROCS=2. On a 2-CPU host that is the whole machine for about 5 s.
2. `TestRunKillGroupOnExit` is in `contract/sys_test.go` (the consumer contract suite), not in `./sys`. After `Run` (with `KillGroupOnExit`) and after `sys.Terminate` return, it calls `waitGone`, which polls `kill(-pgid, 0)` for ESRCH every 20 ms for up to 10 s.
   - `KillGroupOnExit` ("Run returns when the group has no member") and `Terminate` ("does not hand custody back while a group member can still run") already guarantee the event the test needs at the moment they return.
   - On Linux, ESRCH also needs the swept background `sleep` and the supervisor's keeper to be reaped by the host's init or subreaper, because their parents have ended. So the test waits on another process's scheduling.

Required changes, test files only:

- **Custody fixtures stop spinning.** In `TestTimeoutCustodyBlockedObservation` and `TestTimeoutCustodyObservationError`, the shell blocks in a shell builtin, using no CPU and starting no child process while it waits.
  - Recommended form: the Go test creates a FIFO in `s.Cwd` with `syscall.Mkfifo` before `Run`. The script ends in `while :; do read x <> <that fifo>; done`: the shell opens the FIFO read-write, so `read` blocks forever.
  - Use POSIX sh: macOS `/bin/sh` is bash and Linux `/bin/sh` is usually dash.
  - The blocked test's trap stays `echo term > term` with no exit, so SIGTERM cannot end the shell and only the escalation's SIGKILL does.
  - The error test keeps `printf partial` and its trap `echo term > term; exit 0`.
  - The shell stays the fixture's single process, directly parented by the test binary with the supervisor disabled.
  - Every existing assertion, message and deadline in both tests stays.
- **Churn ends on observed exits and runs alone.** `TestLinuxTimeoutObservationChurn` does not call `t.Parallel()`. Top-level sequential tests finish before parallel ones start, so its burst overlaps no other sys test. It has no wall-clock window or deadline:
  - Each of its three workers runs `exec.Command("/bin/true").Run()` exactly 200 times.
  - The main goroutine calls `timeoutGroupAlive(1 << 30)` at least once, and keeps calling it until all three workers have finished (for example, a `sync.WaitGroup` closed into a done channel).
  - It still fails with `calls=%d errors=%d first=%v` on any observation error and still logs that line on success.
  - Helpers it calls use no `time` waits either.
- **TestRunKillGroupOnExit judges the group at the moment the call returns.**
  - Add `liveMembers(t *testing.T, pgid int) []string` to `contract/sys_test.go`. It runs one `ps -A -o pid=,pgid=,stat=` listing; a failed `ps` fails the test. It returns the rows whose pgid equals `pgid` and whose stat does not start with `Z`, `X` or `E`: zombie, dead or exiting rows are not live members.
  - In `TestRunKillGroupOnExit`, keep the existing checks of `Run`'s Status 0, Output `started\n` and the single group. Then require `liveMembers` of the swept group to be empty at once.
  - Without the option, keep the existing presence check and its message "without the option the background process should remain". Then call `sys.Terminate(g)` and require `liveMembers` to be empty at once.
  - Neither the test nor any helper it calls uses a sleep, poll loop, timer or deadline, and the test no longer calls `waitGone`. Failure messages name the group and the live rows.
  - `waitGone` stays as it is for the two other contract tests that use it.

Unchanged:

- Production code (`sys/*.go` without `_test`). No production race was found, and the `KillGroupOnExit` and `Terminate` doc comments stay true as written.
- `TestTerminateEndsPromptlyWhenTheGroupExitsOnSIGTERM` and its 50 ms median: that latency requirement was settled by `l-terminate-prompt-exit-latency`, and the test is sequential, so it runs alone in the binary.
- All other tests and their deadlines.
- Every test name: the contract README and `scripts/slowtests-allowlist.txt` reference `TestRunKillGroupOnExit`.
- The configured checks.

If a run shows another wait failing for lack of CPU, convert that wait to wait on its event. Do not give it a longer deadline.

Verification of the whole-package commands: Kogen's acceptance command has a 120-second limit, and `GOMAXPROCS=2 go test ./sys/... -count=5` alone takes about 100 s here, so the acceptance feature cannot run the Done-when commands as written.

- The acceptance feature runs focused GOMAXPROCS=2 runs of the changed tests: the two custody tests twice under `-race`, and `TestRunKillGroupOnExit` five times. It also vets the sys package for linux/amd64 and pins the removal of the cause in the sources.
- The Build runs `GOMAXPROCS=2 go test ./sys/... -count=5`, `GOMAXPROCS=2 go test -race ./sys/...` and `GOMAXPROCS=2 go test -count=5 -run '^TestRunKillGroupOnExit$' ./contract` before finishing and reports their results.
- The configured `go-test` check runs the full suite at the default GOMAXPROCS.

## Decisions
- The fix removes the cause: tests wait on the event they need (the call's return with no live member, observed process exits) instead of a fixed sleep or a deadline that assumes spare CPUs. No timeout is raised (source: request)
- Done means `GOMAXPROCS=2 go test ./sys/... -count=5` and `GOMAXPROCS=2 go test -race ./sys/...` pass, and the full suite passes at the default GOMAXPROCS (source: request)
- `TestRunKillGroupOnExit`, named by the request, is covered where it lives (`./contract`) at GOMAXPROCS=2 (source: request)
- The commit subject names the cause: busy sys fixtures starving 2-CPU hosts (source: request)

## Source comparison
- Addressed, Problem "`TestRunKillGroupOnExit` and other sys suite tests time out or miss their deadline at GOMAXPROCS=2": the two busy fixtures and the 20 s churn window are removed, and `TestRunKillGroupOnExit` no longer waits on another process's reaping (scenarios 1 to 3).
- Addressed, Wanted "waits on the event it needs (process group gone, exit observed) instead of a fixed sleep or a deadline":
  - "Group gone" is judged at `Run`'s and `Terminate`'s return, excluding zombie, dead and exiting rows, as `sys` defines group members.
  - The churn test ends on 600 observed `/bin/true` exits.
  - Scenarios 2 and 3 check the whole call graphs for `time` waits.
- Addressed, "Raising a timeout is not a fix": no deadline is raised. A timeout-only change fails the scenarios, because the busy fixtures, the churn window and the `waitGone` polling must be gone.
- Superseded, Wanted `-count=3` by Done-when `-count=5`, which is stronger.
- Conflicting, Done-when commands vs the 120-second acceptance limit: the whole-package runs (`go test ./sys/... -count=5` takes about 100 s here, and the race run more) cannot fit in acceptance.
  - Acceptance runs the changed tests at GOMAXPROCS=2: the custody tests `-race -count=2` and `TestRunKillGroupOnExit` `-count=5`.
  - The Build runs and reports the exact Done-when commands.
  - The configured `go-test` check covers the full suite at the default GOMAXPROCS.
- Limitation, not hidden: the 2-vCPU Linux Build host was not reachable while shaping. This darwin/arm64 host already passes `GOMAXPROCS=2 go test ./sys/... -count=1`, and the Linux-only churn test does not run here. Acceptance vets the sys package for Linux and pins the removal of the cause in the sources. It does not prove the Linux run.
- Source: kogen-main P1 ruling 5 Nov (loop Builds moved off EU/eu2 after this failure); repository kogen-loop; change_type fix.

## Tests
- The custody fixtures block in a shell builtin instead of spinning a CPU, with every existing assertion kept: update `TestTimeoutCustodyBlockedObservation` and `TestTimeoutCustodyObservationError` in `sys/timeout_custody_liveness_test.go` (regression)
- The Linux churn test ends after 3 × 200 observed `/bin/true` exits, has no wall-clock window and does not run in parallel: update `TestLinuxTimeoutObservationChurn` in `sys/linux_timeout_observation_linux_test.go` (regression)
- `KillGroupOnExit` and `Terminate` leave no live group member at the moment they return, observed without sleep, poll or deadline: update `TestRunKillGroupOnExit` and add `liveMembers` in `contract/sys_test.go` (regression)
- The changed tests pass repeatedly at GOMAXPROCS=2 (the custody tests also under `-race`): acceptance scenarios 1 and 3 (scenario)
- The full suite passes at the default GOMAXPROCS: the configured `go-test` check `go test ./...` (existing)

## Feasibility
- On this darwin/arm64 host (Go 1.27.2), `GOMAXPROCS=2 go test ./sys/... -count=1` passes today in 19.3 s. No Linux VM or container is available here, so the 2-vCPU Linux failure itself was not reproduced. (probe: exit 0, 19.8 s)
- `TestTimeoutCustodyBlockedObservation` alone at GOMAXPROCS=2: real 6.67 s, user 10.69 s, sys 0.30 s. `TestTimeoutCustodyObservationError` alone: real 3.28 s, user 1.88 s, sys 0.29 s. (probe: exit 0)
- `TestRunKillGroupOnExit` passes at GOMAXPROCS=2 in 2.06 s per run (two 1 s WaitDelay output joins). (probe: exit 0)
- Scratch-copy probe of the new judgement: `Run("sleep 60 & echo started", KillGroupOnExit)` followed by one `ps -A -o pid=,pgid=,stat=` listing, and `sys.Terminate` followed by one listing. In 24 runs at GOMAXPROCS=2 and 8 under `-race`, no row of the group had a stat other than Z, X or E at the moment of return. (probe: exit 0)
- Readiness round 1: acceptance that ran the whole-package Done-when commands exceeded the 120-second acceptance limit, after the first scenario's suite run passed and its spin check failed as expected. Acceptance is now limited to focused runs of the changed tests.
