# Stop counting ps as a member of its own group

Slug: l-sys-groups-mac
Model: not applicable — the fix corrects one membership observation (the ps listing's own row); the group lifecycle rules (finished, live, kept lifeline, retire) and their transitions are unchanged
Acceptance:
- .kogen/intents/l-sys-groups-mac/acceptance.feature
- features/steps/l_sys_groups_mac.js
- features/steps/l_sys_groups_mac_test.go.txt
- features/steps/l_sys_groups_mac_good_lifeline.go.txt
- features/steps/l_sys_groups_mac_bad_lifeline.go.txt

On macOS, after a shell command ends and its process group is empty, `Session.LiveGroups()` must not list that group as live. Linux already gets this right. Today the bug breaks every check that uses LiveGroups to decide what is still running: leftover-group sweeps, retirement, the loop's `custody` teardown (loop/loop.go) and teardown decisions. It also fails `go test ./sys -run '^TestLiveGroupsAndRetireKeepALeftoverGroup$'` on Macs. That makes Kogen's pre-build go-test check fail, so every kogen-loop Build on a Mac stops at startup.

Cause (observed in code at 16f8974; the Linux reproduction is under Feasibility). `groupOthers` in sys/lifeline.go reads `/proc` when `/proc/self/stat` is readable (Linux). Otherwise (macOS) it runs `ps -A -o pid=,pgid=,stat=` with `exec.Command(...).Output()`. That ps process inherits the caller's process group and lists itself with a running, non-`Z` state, so `groupOthers` always reports another member. Here is how a finished `true` stays live:
1. The supervisor (`MaybeSupervise`) sees "others" after its shell ends and calls `leaveKeeper`.
2. The keeper's own `groupOthers` loop always sees its own ps, so it never leaves on its own.
3. `Session.afterCommand`'s `kill(-pgid, 0)` then succeeds because the keeper is alive.
4. The group is never marked finished, and `LiveGroups` returns it. This matches the reported `an empty group stays live: groups [26022] live [26022]`.

The fix goes in the macOS membership listing, not in the LiveGroups bookkeeping: `LiveGroups` correctly lists groups not marked finished. All changes are in sys/lifeline.go:
- Move the ps branch of `groupOthers` into a new unexported function `func psGroupOthers(pgid, self int) (bool, error)`. Define it in sys/lifeline.go next to `procGroupOthers`, with no build tag, so it compiles and can be called on Linux and macOS alike. The acceptance controls replace the whole of sys/lifeline.go, so the function must live in that file.
- `groupOthers` keeps its selection exactly: `procGroupOthers` when `/proc/self/stat` reads non-empty, otherwise `psGroupOthers`.
- `psGroupOthers` keeps today's command, `ps -A -o pid=,pgid=,stat=` resolved through PATH, and keeps today's parsing. A row counts only when its pgid equals `pgid`, its pid differs from `self`, and its state does not start with `Z`.
- New: the row of the ps process that `psGroupOthers` started itself never counts. Start the command with `cmd.Start()`, record `cmd.Process.Pid`, collect stdout, then `cmd.Wait()`, and skip that pid.
- ps stays in the caller's process group (no `Setpgid`), so a group stop still reaches it.
- A failed start or wait returns `(false, err)`, as the failed `Output()` does today. Callers keep treating an error as presence.

Result: on macOS and Linux alike, a group whose command has ended and which has no remaining member is not reported live. A group with a leftover member, such as the test's `sleep 600 &`, still is, and its keeper is still left. The keeper now leaves on its own once its group empties, as it already does on Linux.

Outside this change: `procGroupOthers` and the Linux path, `afterCommand`, `LiveGroups`, `Groups`, `Retire`, `Terminate`, `sweepGroup`, `sweepOwnGroup`, `RunContext`, the timeout-observation files (sys/timeout_observation_*.go), `Options` and `ForeignKill` all keep today's behavior. Reaping, teardown, cancellation and foreign-kill refusal are unchanged. No new option, limit, timeout, retry or sleep. Standard library only, and go.mod gains no requirement. `sys/run_context_test.go`, including `TestLiveGroupsAndRetireKeepALeftoverGroup`, stays byte-identical and must pass unedited.

Add one CHANGELOG.md line under `## v0.1.0 (unreleased)`: "Stop counting the ps listing as a group member on macOS (L-SYS-GROUPS-MAC): without `/proc`, the supervisor and keeper no longer count the `ps` process they start as a member of the group it lists, so an ended command's empty group is not left with a keeper and `sys.Session.LiveGroups` no longer reports it live; a group with a leftover member is still live. Linux and every option are unchanged."

Reserved for acceptance: the path `sys/l_sys_groups_mac_acceptance_test.go`, which is overlaid and must not be created; the test name `TestLSysGroupsMacAcceptance`; the `lsgm` identifier prefix in package sys tests; and the environment variable `LSGM_HELPER`.

## Decisions
- Applies on both supported platforms, macOS Apple Silicon and Linux x86-64 glibc; an empty ended group is not live, and a group with a leftover member still is (source: request)
- No new option, limit, timeout, retry or sleep; standard library only; reaping, teardown, cancellation and foreign-kill refusal unchanged (source: request)

## Source comparison
- "A finished command's empty group stays live on macOS" (request Problem): addressed by `psGroupOthers` excluding its own ps row. The supervisor leaves no keeper and the keeper exits once the group empties, so `afterCommand` marks the group finished. Covered by acceptance scenarios 1 and 2.
- "A group with a leftover member (the `sleep 600 &` case) still is [live]" (request Need): preserved. Scenario 1's `member` case expects `others: true`; scenario 2 runs the existing test, whose second half asserts the leftover group is live and then retires it.
- "The existing test passes on both supported platforms, repeatedly (separate -count=1 runs)" (request Need): scenario 2 runs `TestLiveGroupsAndRetireKeepALeftoverGroup` in package `./sys` in 5 separate `go test -json -count=1` processes and requires `sys/run_context_test.go` to be byte-identical (sha256 `9557487d0382df3ceec1fa9013464b1d7b51082f7ceed99a6878789ebdaa7fcc`). The reported Mac failure was 5 of 5 runs; Linux passes today.
- "without sleeps used as synchronisation" (request Need): the fix adds no sleep. Scenario 3 asserts the non-test sys sources still have at most the 3 `time.Sleep(` calls they have today, in `sweepGroup`, `Terminate` and `sweepOwnGroup`.
- "Reaping, teardown, cancellation and foreign-kill refusal behave as today. No new option, limit, timeout or retry; standard library only" (request Need): scenario 3 runs the whole `./sys` package once and checks go.mod has no `require`. The configured `go test ./...`, `go vet`, `gofmt` and `go build` checks also cover this.
- Evidence literals kept as history, not as current tests: the reported Mac failure was `run_context_test.go:85: an empty group stays live: groups [26022] live [26022]` on kogen-loop 16f8974, Go 1.27.2, user kogen-runner. Kogen Build 951f5277 (L-TOOL-OVERLAP) stopped with check_failing on that test.
- Request-named code: the request points at sys/sys.go `LiveGroups` and the per-platform liveness files. Those are evidence, and inspection shows they are not the defect: `LiveGroups` correctly lists groups not marked finished, and `timeoutGroupAlive` serves only `Options.Timeout` custody. They stay unchanged.
- Omitted: a macOS-native `sysctl` replacement for the ps listing. It is not needed for the requested outcome and would change more than the defect.

## Tests
- The ps membership listing never counts its own ps process; a lone caller's group reports no other member: add `TestPsGroupOthersIgnoresItsOwnListing` in a new sys/lifeline_test.go. It re-runs the test binary as a helper leading a new process group (`SysProcAttr{Setpgid: true}`), and the helper asserts `psGroupOthers(syscall.Getpgrp(), os.Getpid())` returns `false, nil`. It runs on Linux and macOS without sleeps and must fail with the unfixed listing (regression)
- A group with a live non-zombie member other than self is still reported: in the same test, the helper starts a `sleep 600` child that inherits its group, asserts `true, nil`, then kills and reaps the child (regression)
- A finished command's empty group is not live, and a leftover group is live and can be terminated and retired: `TestLiveGroupsAndRetireKeepALeftoverGroup` in sys/run_context_test.go, unchanged (existing)
- Reaping, teardown, cancellation, supervisor/keeper and foreign-kill refusal are unchanged: the existing sys package tests pass unchanged (existing)

## Feasibility
- evidence: {"id":"ps-listing-observer","kind":"observer","inputs":["features/steps/l_sys_groups_mac.js","features/steps/l_sys_groups_mac_test.go.txt","features/steps/l_sys_groups_mac_good_lifeline.go.txt","features/steps/l_sys_groups_mac_bad_lifeline.go.txt"],"observers":["features/steps/l_sys_groups_mac.js","features/steps/l_sys_groups_mac_test.go.txt"],"checks":[{"name":"good","command":"node features/steps/l_sys_groups_mac.js --control good","exit":0,"output":"l-sys-groups-mac observer good\n"},{"name":"bad","command":"node features/steps/l_sys_groups_mac.js --control bad","exit":1,"output":"l-sys-groups-mac observer bad rejected\n"}]}
- Reproduced on Linux (Go 1.27.2, procps `ps` at /usr/bin/ps) through a scratch `go test -overlay` outside the checkout. With the unfixed listing, a helper alone in its own group got `{"alone":{"others":true,"error":""},"member":{"others":true,"error":""}}`: the ps row counted. With the ps pid excluded it got `{"alone":{"others":false,"error":""},"member":{"others":true,"error":""}}`. On the unchanged tree the fixture fails to compile with `undefined: psGroupOthers` (legitimate missing-feature red). (scratch probe: exit 0 for both control runs, about 1 s each)
- In a scratch copy of the checkout, acceptance gave 2 passed and 1 failed (scenario 1) on the unchanged tree, and 3 passed with the known-good sys/lifeline.go. The whole `./sys` package passed in about 53 s. (scratch run: about 60 s each)
- Not observed here: no macOS host was available in this session. The macOS root cause is inferred from code and the reported 5/5 failure: on macOS `groupOthers` takes the ps branch, and BSD `ps -A` lists itself. On macOS, acceptance scenario 2 exercises the reported symptom directly.
