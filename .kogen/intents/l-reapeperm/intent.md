# Remove gone-group fixture allocation races

Slug: l-reapeperm
Model: not applicable — this fixes deterministic test inputs, not production state or lifecycle semantics
Acceptance:
- .kogen/intents/l-reapeperm/acceptance.feature
- features/steps/l_reapeperm.js

Fix L-REAPEPERM (Studio record kogen-loop/gone-group-fixture). Replace the live allocation/reaping assumption in sys/linux_timeout_observation_test.go. Production behavior and loop defaults remain unchanged. The chosen solution is explicit kill-result injection into the existing decision algorithm, retaining the real syscall-backed entry point. Use a small function-parameter seam, not global mutable state or a new production abstraction. Remove lobGoneGroup and its shell process allocation. Use a fixed synthetic pgid greater than 1 only with the injected probe; never send that synthetic group to the OS.

## Decisions
- Make ESRCH, EPERM and successful kill results deterministic rather than attempting to reserve a reaped pgid. No assertion retries or sleeps. (source: request)
- Keep production EPERM and success as presence witnesses, and retain every existing proc-scan and invalid-pgid case. (source: request)
- Shared-host safety: no stopping processes by name or pattern, no synthetic CPU load, only terminate pids started by the test, and use temporary directories for any scratch work. Do not create host load to simulate other users. (source: request)

## Source comparison
- Addressed: request's 29 October 2026 baseline failure at sys/linux_timeout_observation_test.go:58, lobGoneGroup: reaped pid reuse can make kill(-pid, 0) return EPERM. The old sh -c "exit 0" plus ESRCH assertion is removed by the outcome above; no claim is made that a reaped pgid stays unused.
- Addressed: request's alternative of injected kill results is selected. Tests exercise the same decision algorithm as linuxTimeoutGroupAlive; do not copy its logic into tests. The syscall-backed wrapper preserves production behavior, including invalid group rejection before probing.
- Addressed: acceptance.feature runs the requested go test -count=200 -run TestLinuxTimeoutObservationDecisions ./sys command, then verifies explicit deterministic cases by name. Add subtests kill_EPERM_reused_pgid, kill_success and kill_ESRCH_absent within that existing test. EPERM and success must return (true, nil) even with an unreadable proc fixture; ESRCH plus an empty complete scan returns (false, nil). Existing zombie, vanished-entry, unreadable, malformed, short, listing and member-beats-error cases continue with injected ESRCH.
- Addressed: all configured checks remain required and unchanged: go-format, go-test, go-vet and go-build in .kogen/project.yaml. The MacBook shared-host 200-run acceptance is required when that runner is available; local evidence must not be described as proof of another machine or concurrent-user load.
- Addressed: request's historical contrast (48840cb passed on Studio Mac but failed at MacBook baseline under load about 14 with several users) motivates deterministic inputs, not a production change. No retries, sleeps, process-name kills or artificial load are authorized. No requested behavior is omitted or superseded beyond replacing the defective fixture strategy.
- Repository note: README links docs/testing-rules.md, which is absent locally; the supplied testing rules govern this Intent. No unrelated documentation repair is requested.

## Tests
- Reused-pgid EPERM must not break fixture setup and must remain present: add deterministic kill_EPERM_reused_pgid subtest in TestLinuxTimeoutObservationDecisions using injected EPERM and an unreadable proc fixture (regression)
- Successful kill remains present and ESRCH with complete empty proc scan is absent: add kill_success and kill_ESRCH_absent subtests of the shared decision algorithm (unit)
- Existing proc scan semantics and invalid-pgid rejection remain unchanged: preserve TestLinuxTimeoutObservationDecisions cases and TestLinuxTimeoutObservationGuard with deterministic inputs (existing)
- Decision tests no longer depend on live pid allocation: run the requested 200-count command and require all three explicit cases to pass 200 times (regression)

## Feasibility
- The requested command `go test -count=200 -run TestLinuxTimeoutObservationDecisions ./sys` ran in the scratch tree: exit 0 in 2.8 s, output `ok  \tkogen-loop/sys\t2.334s`. This baseline success does not disprove the reported race or qualify shared-host MacBook behavior. The missing deterministic named cases distinguish the fix. No external dependencies or protocol facts need lookup.
