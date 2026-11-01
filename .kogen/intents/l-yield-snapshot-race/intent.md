# Stop yielded shells before returning control

Slug: l-yield-snapshot-race
Model: .kogen/intents/l-yield-snapshot-race/model.qnt invariants=StableReturn seed=1 samples=100 steps=20
Acceptance:
- .kogen/intents/l-yield-snapshot-race/acceptance.feature
- features/steps/l_shell_lifecycle.js

Fix L-YIELD-SNAPSHOT-RACE in kogen-loop (Studio issue 49fd390a-e1cc-4e43-8daa-3bc24df4bb29): before returning control from a round or abandoning an attempt, finish or stop the commands it started and join their work. A caller reading the working tree immediately after return must not race those commands. This repairs the existing L6 cleanup guarantee, not shell yielding or the af456d5 wait behavior. No new command, flag, option, timeout, retry or limit; no Kogen vendor/pin changes, global installation, publication or CHANGELOG entry.

## Decisions
- Keep one-second shell yielding, handles and cumulative retrieval unchanged inside a round; preserve af456d5's at-most-30-second retrieval wait and immediate completion return. Background processes may live between calls, not beyond their owning round. (source: request)
- Require deterministic offline evidence using a scripted provider and real processes, with immediate post-return process and filesystem assertions rather than a grace period that hides the race. (source: request)

## Source comparison
- Addressed: request Need and Acceptance evidence are enforced by the YieldSnapshot regression and the feature's cleanup cases. L6 and the overlap contract in docs/contract/loop-v1.md remain authoritative: terminal/no-call, errors, cancellation and deadline all clean up; discarded attempts cancel and join before retry. Pre-round groups and processes outside custody are unchanged.
- Addressed: incident evidence was 1 of 76 build cells on 1 Nov, snapshot 11 s after a running envelope, `git add -A -- .` failing with `fatal: unable to stat 'internal/tmpl/expand_test.go.2127067331120939396'`, internal exit 70 and 2,145 s lost. Reproduce the transient-file/process race deterministically rather than repeat these historical timings or require the same random gofmt suffix. The regression uses that path as a representative transient filename and performs the same Git command immediately after return.
- Addressed: request's unchanged yielding, handle retrieval and af456d5 wait behavior map to existing shell lifecycle/handle tests and affected tools/loop tests, retained unchanged. No timeout, retry, limit, CLI or policy change is authorized.
- Conflicting current evidence, not changed scope: loop.Run defers EndShellRound and custody, and tools.EndShellRound claims cancellation and joining. Their existence does not establish effective cleanup of yielded commands; investigate tools shell context ownership and sys captured-command lifetime, not merely the defer order. Required implementation paths in loop/, tools/ and sys/ are not protected. Keep this Intent and its listed step file unchanged during Build.
- Omitted: no requested product behavior is omitted; historical frequency, timing and cost are context, not probabilistic acceptance thresholds.

## Tests
- Yielded real commands cannot mutate the tree after round return: add conformance.TestShellLifecycleYieldSnapshot using loop.Run, real tools.Tools shell and the existing scripted provider/owned-process fixtures (regression)
- All round endings honor immediate custody cleanup: exercise terminal, no-call and ordinary requester/hook errors in TestShellLifecycleYieldSnapshot, retaining existing cancellation/deadline/startup coverage (integration)
- Abandoned attempts stop their yielded commands before retry publishes further work: retain TestDiscardedAttemptStopsYieldedShell and extend its real-process observation if necessary to assert stopped processes rather than handle expiry alone (regression)
- Yield, handle retrieval, wait and between-call behavior remain unchanged: retain existing conformance shell lifecycle/handle tests, tools shell_yield tests and loop shell-attempt tests; run configured checks including affected tests with race detection (existing)

### Regression implementation contract

Add the named Go regression in an unprotected conformance test file, reusing newLifecycleRun, scripted, shellItem and existing process observation helpers. Test explicit and implicit tool sessions, and default unhooked execution as well as the hook/error path. Use a private root initialized as a Git repository so `git add -A -- .` is meaningful. No external credentials or provider traffic.

The real shell fixture must write its PID/identity and repeatedly create and remove `internal/tmpl/expand_test.go.2127067331120939396` for several seconds (longer than the one-second yield). Arrange bounded deterministic coordination so the fixture is alive and has produced transient files at yield; use a trap/fixture cleanup for its own transient files. Do not add product-level deletion of arbitrary command-created files: cleanup is process custody, not rollback. Ensure the fixture remains capable of writing when the scripted provider ends the round; do not accidentally let it complete before testing cleanup. Parse the actual shell result as JSON and require status `running` plus a nonempty handle before ending. Assert it stays alive between yield and round ending, preventing a false fix that kills on yield. Record owned process/group identities before ending.

Immediately on loop.Run returning, without polling for eventual death or sleeping first, assert no live owned process/group remains and the fixture's transient file is absent. Run `git add -A -- .` at that boundary and require exit 0. Continue observing for a bounded two-second interval and require the file never reappears and no fixture writes advance. Check that cleanup already happened before test teardown; teardown must kill surviving owned processes on failure, not produce a passing observation. Bound all coordination waits (at most ten seconds), fail explicitly on fixture startup failure, and always reap test processes. Preserve original successful endings and sentinel error identity on error paths. Test command/fixture cleanup must not touch unrelated or pre-round processes. Existing success/failure lifecycle tests remain useful even though their eventual wait alone is weaker than this new regression.

## Feasibility
- Repository inspection identifies local shell registry/captured-command ownership and round custody as the material dependency; no external protocol/library change or documentation lookup is needed for this standard-library lifecycle repair.
- Probe observed that the proposed named Go command runs successfully but has no matching test on baseline; acceptance must reject this false green. Model typecheck and 100 samples of 20 steps passed in the scratch probe; this is an abstract cleanup invariant, not process proof.
- evidence: {"id":"named-test-observer","kind":"observer","inputs":["features/steps/l_shell_lifecycle.js"],"observers":["features/steps/l_shell_lifecycle.js"],"checks":[{"name":"good","command":"node features/steps/l_shell_lifecycle.js --control good","exit":0,"output":"observer accepted\n"},{"name":"bad","command":"node features/steps/l_shell_lifecycle.js --control bad","exit":1,"output":"observer rejected\n"}]}
