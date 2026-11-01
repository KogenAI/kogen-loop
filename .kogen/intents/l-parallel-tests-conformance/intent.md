# Run Loop's conformance tests in parallel

Slug: l-parallel-tests-conformance
Model: not applicable — the change only schedules existing tests of one package concurrently; no product state, protocol or rule changes
Acceptance:
- .kogen/intents/l-parallel-tests-conformance/acceptance.feature
- features/steps/l_parallel_tests_conformance.js

Fix (L-PARALLEL-TESTS-CONFORMANCE, split from L-PARALLEL-TESTS; Studio kogen-loop issue fc2fece0-5229-4873-b884-a17daf122466, owner priority 31 Oct: test-suite speed first). Make the independent tests of the `conformance` package (`kogen-loop/conformance`) run in parallel so its uncached `go test` is shorter, without weakening protocol, real process/signal cleanup, timeout, race or failure-propagation coverage. Only `conformance/*_test.go` changes (test code, plus shared test helpers inside that package if one is needed). No production code, no other package's tests (provider, sys, tools, loop, api, cmd are the other split items), no new command, flag or option, and no timeout, retry or limit change. No test is renamed, removed, skipped or loosened; every existing assertion stays. No paid provider requests: every test keeps its local fake provider and private test credentials. No CHANGELOG.md entry: the commit message records the change.

Current behavior (eaea000): the package has 79 top-level tests (plus `TestMain`) and 216 tests including subtests, with zero `t.Parallel` calls. Shaping measured on this MacBook (darwin/arm64, Go 1.27.2, uncached `-count=1`, run directly, not through the host lock): `go test -json -count=1 ./conformance` 39 s and 37 s wall (package 37.9 s); with `-race` 74 s (72.4 s); `-count=3` 127 s (127.1 s) and, in a later baseline, 108.8 s package time. All passed.

Required behavior:

1. Every top-level `Test…` function in `conformance/` calls `t.Parallel()` as its first statement, except `TestShellLifecycleCancelStartup` and `TestShellLifecycleDeadlineStartup` (`conformance/shell_lifecycle_test.go`). `TestLoopCorrectFailedWrite` re-runs the test binary as a child; its `t.Parallel()` may come first, before the child check, and the test must still pass.
2. The two startup tests stay serial, with a comment at each test (or at `startupRound`, referenced from both) giving the reason: they install `shellStartHook`, the test seam linked to the process-wide `kogen-loop/sys.startHook`. That hook fires for every in-process shell start in the test binary and counts `enter` stages, so another test's concurrent in-process shell would be counted or held instead of the round's second call. The result would be a wrong shell held, a double `close(reached)` panic, or a 30 s "never reached" failure. Go runs non-parallel top-level tests to completion before it releases the parallel ones, so these two never overlap another test. Their subtests (`enter`, `starting`, `started`, and the `cli` subtest of the deadline test) do not call `t.Parallel()`. The `startupRound` 200 ms hold after the context ends stays unchanged. It is the window under test: the round must react to the ended context while the shell start is held. During `starting` the session lock blocks every group query, so no test-side readiness event exists for it without a production seam.
3. These subtest groups call `t.Parallel()` as the first statement of each subtest body. Each subtest already builds its own world, fake provider, CLI process or shell session:
   - `TestFixtures` (process_test.go, one subtest per `testdata/*.json`)
   - `TestInterruptionTerminatesTheShellGroup`
   - `TestShellLifecycleKilledHostDescendants`
   - `TestShellLifecycleSuccessCleanup`
   - `TestShellLifecycleFailureCleanup`
   - `TestRequestBudgetCLI`
   - `TestAnthropicInvalidDiagnosticsConformance`
   - `TestHookCancellationCannotEndTheRoundOrStartMoreWork`
4. `TestResumeRefusesAMismatchBeforeAnyRequest` subtests stay sequential, with a comment giving the reason: they share one transcript directory, and `other protocol in the transcript` rewrites `session.json` and restores it afterwards.
5. Other subtest groups stay as they are (sequential inside their now-parallel parent). Each takes under 3 s under `-race` (measured 0 to 2.7 s), and they already run concurrently with every other top-level test. The per-run critical path is the serial startup tests (about 12 s) plus the longest parallel test, so parallel subtests there would not measurably shorten the run. Several of them also share their parent's world (`TestStrictTaskRefusal`, `TestUnsupportedProtocolIsRefusedBeforeItsFieldsAreJudged`, `TestMalformedTaskObjectIsRefusedBeforeSessionOrRequest`, `TestHandledCall`, `TestHookErrorStopsTheRound`).
6. Shared helpers stay as they are: `newWorld` gives every caller private `t.TempDir()` HOME/TMPDIR/root; `newFakeProvider` serves one test; `cliBinary` already builds `cmd/kogen-loop` once per test binary with `sync.Once` and `TestMain` removes it. Do not add a second build or a per-test build. Shaping's scratch run needed no helper change.
7. No other fixed padding exists to replace: the remaining waits are readiness polls (`readPid`, `pidGone`, `owned.waitGone`, `noLiveMembers`, the request-count poll in `TestShellLifecycleKilledHostDescendants`), deadlines under test (`deadline_seconds` 1/2/3, the 500 ms and 800 ms contexts), or hang guards that a passing run never reaches. Leave them unchanged.
8. Race and repetition: before delivery the Build runs `go test -race -count=1 ./conformance` and `go test -count=3 ./conformance` and both must pass with no race report. These runs are part of the measurement report below. Kogen limits the acceptance command to 120 s, so they are not in the acceptance scenario: on the unchanged base they take 74 s and 127 s.

Measurement report (Build summary and commit body): measure on this MacBook with the same Go 1.27.2 toolchain and the same source scope (`./conformance`). Run at least three before runs (at the base, before editing) and three after runs of each of `go test -count=1 ./conformance` and `go test -race -count=1 ./conformance`, timed directly (for example `/usr/bin/time -p`), not through `heavy.sh`, so queue wait is excluded. `-count=1` excludes cache hits; report any "(cached)" result separately. For each run, report wall time, package time from the `ok` line, the number of failed tests and any race report. Also report the `-count=3` run of rule 8 and that the full `go test ./...` passes. To show every test still runs, compare per-test pass counts of before and after `go test -json` runs, with any `t.TempDir` path in a test name treated as the placeholder `<TempDir>`. Say so in the report. The conformance package has no such name today; the existing test that has one is in another package and must not be renamed or changed.

The prior L-PARALLEL-TESTS Build 7d72b6bd measured conformance at 37.3 s before and 12.7 s after in one check comparison. That is context, not acceptance, and it is not a target here.

## Decisions
- Parallel by default for independent conformance tests; every serial group keeps a stated, demonstrated reason (rules 1–5) (source: request)
- Only conformance test code changes; no new command, flag, option, timeout, retry or limit; no paid provider requests (source: request)
- Keep the single `sync.Once` CLI build; do not duplicate it (source: request)
- Proof that every test still runs compares test names with any TempDir path as `<TempDir>`, and does not rename the existing TempDir-named test (source: request)
- Fixed padding is replaced only where the wait is not itself under test; the `startupRound` 200 ms hold is under test and stays (rules 2 and 7) (source: request)

## Source comparison
- Request "safe parallel execution is the default…; every remaining serial group has a demonstrated reason": addressed by rules 1–5 and the acceptance scenario (top-level pause check, required parallel and sequential subtest lists).
- Request "shorter uncached time…": addressed by the acceptance scenario (uncached `-count=1`, overlap at least 1.5) and by the measurement report. Shaping scratch with rules 1–5: 39 s and 37 s to 23 s plain, 74 s to 41 s and 36 s race, 127 s to 66 s and 64 s at `-count=3`, all passing.
- Request "without weakening protocol, real process/signal cleanup, timeout, race or failure-propagation coverage": every assertion stays; all 216 names must pass in the acceptance run. Race and repeated runs are required by rule 8 and reported; they are outside the 120 s acceptance limit.
- Request "replace measured fixed padding with readiness events where the wait is not itself the thing under test": rule 7 inventories the waits; the only fixed wait (rule 2, 200 ms) is under test; nothing else qualifies.
- Request "where to look: TestFixtures; newWorld/cliBinary": rule 3 (TestFixtures subtests parallel) and rule 6 (no second build).
- Request "acceptance evidence: repeated uncached before/after on the MacBook…, full `go test ./...` stays green": the measurement report paragraph, rule 8, and the configured `go-test` check (`go test ./...`).
- Request "measurement constraint (1 Nov 2026)": the step normalizes TempDir paths to `<TempDir>` before comparing names, and the report says so. No test is renamed.
- Request "prior candidate diff supplied as context": only its first part could be read (the rest was outside this session's readable paths). The visible part only adds `t.Parallel()` to top-level tests and to the `TestHookCancellation…` subtests, consistent with rules 1 and 3. Its 12.7 s single run is not a target.
- Request issue text about provider `idlePoll` and sys signal tests: belongs to the provider and sys+tools items; out of scope here.

## Tests
- Independent top-level conformance tests call t.Parallel; only the two startup tests stay serial: acceptance scenario, the top-level pause check on an uncached run (scenario)
- Listed subtest groups run in parallel; startup and resume-mismatch subtests stay sequential: acceptance scenario, the subtest pause checks (scenario)
- Every one of the 216 existing tests still runs and passes, names compared with TempDir as `<TempDir>`: acceptance scenario (scenario)
- Uncached runs overlap instead of running one test after another: acceptance scenario, overlap at least 1.5 (scenario)
- Protocol, process/signal cleanup, timeout and failure-propagation assertions are unchanged: the existing conformance tests, unchanged apart from `t.Parallel()` calls and reason comments, also run under `-race` and `-count=3` per rule 8 (existing)
- The full suite stays green: the configured `go-test` check `go test ./...` (existing)

## Feasibility
- Shaping ran the observer on the unchanged base and on a scratch copy outside the checkout. The scratch copy had `t.Parallel()` on 77 top-level tests and on the 25 subtests of rule 3, and no other change. The scratch passed the scenario in 23 s wall. The base fails it in 37 s at the top-level pause check (`TestAnthropicInvalidDiagnosticsConformance ran but did not pause`) after passing the 216-name check. In earlier scratch runs the overlap was 4.85 under `-race` and 3.17 at `-count=3`; the base's `-count=3` overlap was 0.995. These are shaping observations, not Kogen probe records.
- evidence: {"id":"lptc-observer","kind":"observer","inputs":["features/steps/l_parallel_tests_conformance.js"],"observers":["features/steps/l_parallel_tests_conformance.js"],"checks":[{"name":"good","command":"node features/steps/l_parallel_tests_conformance.js --control good","exit":0,"output":"observer accepted\n"},{"name":"bad","command":"node features/steps/l_parallel_tests_conformance.js --control bad","exit":1,"output":"observer rejected 6 of 6 bad reports\n"}]}
