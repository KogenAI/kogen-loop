# Stop every shell at the end of its run

Slug: l-shell-lifecycle
Model: .kogen/intents/l-shell-lifecycle/model.qnt invariants=Safe seed=17 samples=100 steps=20
Acceptance:
- .kogen/intents/l-shell-lifecycle/acceptance.feature
- features/steps/l_shell_lifecycle.js

Fix shell lifecycle custody in kogen-loop. Cancellation and deadlines must cover shells before, during and after startup, including a shell registered after the old one-shot group snapshot. Join teardown before returning. A killed host's supervisor must complete whole-group escalation even when the direct shell exits on SIGTERM and a descendant ignores it. End every round's shell groups on success and ordinary failure as well as cancellation/deadline/interruption. Background servers must still survive between shell calls within the round; do not set KillGroupOnExit on every shell call as a substitute. Preserve groups started before the round and unrelated host processes.

Normal command behavior and tool-result bytes remain identical, including output bounds, exit statuses, refusals and the shell definition `Commands have no time limit.` No new option, per-call limit or raised timeout. Keep lower-level sys.Options.Timeout and its existing observation/custody contract. Process-group custody does not expand to deliberately detached setsid/daemon processes. Update stale maintained contract comments where context forwarding or cleanup semantics change. No provider behavior, release, install, vendored copy or pin changes.

## Decisions
- Stop all shells belonging to the ending run regardless of outcome, but retain background processes between calls in that run. (source: request)
- Use only private temporary directories and owned PIDs/process groups in fault tests; never name/pattern-based killing, synthetic CPU load or paid providers. (source: request)
- Preserve the current bounded SIGTERM-to-SIGKILL escalation interval; prompt return means bounded teardown, not a new execution timeout. (source: request)

## Source comparison
- Addressed request L-SHELL-LIFECYCLE items 1 and 4 / LC-01: startup and late-registration cancellation/deadline races are required below in TestShellLifecycleCancelStartup and TestShellLifecycleDeadlineStartup, not merely a repeated sweep with a remaining startup gap. Current loop/loop.go custody snapshots Groups and tools/tools.go discards shell context; these are evidence of the defect, not desired behavior.
- Addressed item 2: TestShellLifecycleKilledHostDescendants requires supervisor escalation against a TERM-resistant descendant after the direct shell has died. sys/sys.go MaybeSupervise currently exits after cmd.Wait without joining lifeline cleanup; replace that behavior, preserving normal status/output.
- Addressed item 3: TestShellLifecycleSuccessCleanup and TestShellLifecycleFailureCleanup cover normal run endings; current custody only sweeps on context cancellation or session interruption. Successful cleanup must not require callers to cancel a completed context.
- Addressed Must stay and all Acceptance bullets: compatibility test plus full race and configured checks below. Preserve existing tests, including lower-level timeout observation. No options or timeout increases are authorized.
- Addressed Host safety by the fixture constraints below. Scope retains README and docs/contract/loop-v1.md group ownership and detached-process limitations, not an OS sandbox guarantee.
- Audit provenance supplied by request: kogen-research loopFailPaths static review of b97ee73 (29 Oct 2026), AUDIT-loopFailPaths.md, and loopCorrect LC-01, AUDIT-loopCorrect.md, same day; supplied locations loop/loop.go:294,:304 and tools/tools.go:88,:104,:422. Those audit files are absent from the repository listing; no additional unseen audit content is claimed. All four copied findings are included in the executable named-test acceptance contract, none omitted or superseded.

## Tests
- Cancellation during startup cannot miss a shell or hang the round: add TestShellLifecycleCancelStartup in ./conformance (regression)
- Deadline during startup cannot miss late registration: add TestShellLifecycleDeadlineStartup in ./conformance (regression)
- Host death completes group escalation despite direct-shell exit: add TestShellLifecycleKilledHostDescendants in ./conformance (regression)
- Successful runs stop their background shells only at run end: add TestShellLifecycleSuccessCleanup in ./conformance (regression)
- Ordinary failures stop their background shells: add TestShellLifecycleFailureCleanup in ./conformance (regression)
- Normal shell/result bytes and between-call background lifetime stay unchanged: add TestShellLifecycleCompatibility in ./conformance and retain existing shell goldens and sys tests (integration)
- Concurrent lifecycle code is race-free and configured checks stay green: run go test -race ./..., go test ./conformance -count=1, go vet ./..., go build -o /dev/null ./... and configured go-format/go-test checks (existing)

### Executable named-test contract

Acceptance invokes `go test -json -count=1 -timeout=180s ./conformance -run ^<name>$` for each exact name above, requiring that the named top-level test ran and passed, with no skipped subtests. Add these implementation-owned tests outside Acceptance protection. They must exercise real processes and observable outcomes, not assert implementation structure or only model transitions. Reuse conformance's scripted requester, private credentials and local fake-provider helpers. At least the success/failure and cancellation/deadline cases must use loop.Run with real tools.Tools shell execution; also exercise the standalone CLI boundary for deadline and host-death custody using the existing local fake server, not a paid provider.

For startup fault tests use bounded synchronization/fault injection at the actual shell-start boundary to force stop before launch, while startup is in progress, and immediately after launch/registration. Explicitly force the LC-01 ordering: the cancellation/deadline cleanup has had a chance to observe existing groups before startup is released. A scheduling sleep or many probabilistic repetitions alone is insufficient. Test-only package-local seams are permitted where necessary; do not add a production public API solely for mocking. Assert context.Canceled or context.DeadlineExceeded at library level, the existing loop/deadline error and exit 1 at CLI level, no interrupted tool-result publication or subsequent provider request, bounded return (within 10 seconds after releasing the start gate, allowing existing five-second escalation), and no surviving owned shell/descendant. Release all gates in failure cleanup.

Host-death test starts a real supervised host and a shell with a descendant that ignores SIGTERM. Record owned PID identities in temp files and wait for readiness before SIGKILL of that host only. Direct shell must exit on TERM, leaving the descendant to require SIGKILL. Observe descendant termination within 10 seconds; merely observing direct-shell exit is insufficient. Include a case where the shell already finished leaving a background descendant when the host dies.

Success and ordinary-failure cases start a background process with output redirected so inherited pipes do not fake a hung foreground shell. Prove it remains alive for a subsequent call in the same round. Then terminate via both no-call and terminal success, and via an ordinary requester or hook error with the context still live. After loop.Run returns, every process that round started must be stopped. Assert the ordinary sentinel error remains unchanged. Preserve a pre-round session group as an ownership control and explicitly clean it up afterward. Compatibility asserts exact shell output `exit status: 7\nout\nerr\n` for `printf 'out\n'; printf 'err\n' >&2; exit 7`, and existing definition/golden behavior. No per-call timeout is introduced.

Every process fixture uses t.TempDir, finite readiness and observation waits, and deferred cleanup of only processes/groups it created, even on assertion failure. Distinguish terminated zombies from live survivors; reap children owned by the test. Do not mistake PID reuse or an ESRCH on only the direct shell for whole-group termination. Fixture setup failures and unsupported observation are honest failures, not passes/skips. Keep useful existing lifecycle, cancellation and timeout tests. The model abstracts startup in flight and terminal cleanup: ending freezes starts, resolves pending launch custody, and drains live groups before return. It is a safety model, not proof of OS scheduling or liveness.

## Feasibility
- Repository inspection found no required protected production edits: likely changes are loop/loop.go, tools/tools.go, sys/sys.go, their implementation-owned tests and maintained docs, not .kogen/project.yaml or Acceptance artifacts.
- Model typecheck and TypeScript run Safe passed with seed 17, 100 samples and 20 steps (scratch probe: exit 0, 3.5 s). No runtime lifecycle support is inferred from this abstract check.
- Documentation discovery returned unrelated results for the first context query and no sources for the pkg.go.dev-scoped query; no useful discovery result is claimed. Fetched https://pkg.go.dev/context (retrieved, untrusted) independently confirms AfterFunc runs asynchronously and stop does not join its callback; only that API text was used, not the unrelated marker in the retrieved body.
- evidence: {"id":"named-test-observer","kind":"observer","inputs":["features/steps/l_shell_lifecycle.js"],"observers":["features/steps/l_shell_lifecycle.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/l_shell_lifecycle.js --control good","exit":0,"output":"observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/l_shell_lifecycle.js --control bad","exit":1,"output":"observer rejected\n"}]}
