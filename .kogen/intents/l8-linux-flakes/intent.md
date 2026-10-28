# Fix two Linux test flakes in kogen-loop

Slug: l8-linux-flakes
Model: not applicable — test-only synchronization fix with no meaningful state
Acceptance:
- .kogen/intents/l8-linux-flakes/acceptance.feature
- features/steps/l8_linux_flakes.js

Two tests fail randomly on Linux under `go test -race`. Fix each by waiting on the event it needs, not wall-clock time. Raising a timeout, retry count or limit is not a fix. A deadline that remains must be only a safety ceiling that a passing run never nears, and the wait before it must be event-driven. If the code under test has a real race, fix the code and say so in the commit. Otherwise only test files change.

1. `provider/wait_test.go` `TestEmptyTerminalMetadataKeepsOrderedItemsOnAnOpenSocket`. Observed ordering defect: the `openEvents` handler (provider/helpers_test.go) flushes frames and only then `close(opened)`, so the client can return first and the test's non-blocking `select { case <-opened: default: Fatal }` fails. Block on `<-opened` (event). Wait for `<-closed` without the fixed 2 s `time.After`; a large ceiling is allowed only as a hang guard. Keep the test proving that the validated open stream is cancelled by the client: the helper's 5 s fallback in `openEvents` must not close `closed`, so a non-cancelled stream cannot pass. Do not alter the other assertions (items, usage, single request).
2. `sys/timeout_custody_liveness_test.go` `TestTimeoutCustodyBlockedObservation`: the observer fixture binary (`go test -c -overlay`) is built once per test binary (shared via `sync.Once`, build error remembered and reported by every caller), used by both this test and `TestTimeoutCustodyObservationError`, not once per subtest. Remove the 30 s wall-clock deadline on the build (it must not be killed by load). The shared build directory is created with `os.MkdirTemp` and removed in `TestMain` (sys/sys_test.go) after `m.Run`. All existing assertions stay.

Must stay: each test proves what it proves today; nothing skipped, deleted or weakened; no test-only flags in production code; all configured checks pass; `go test -race ./...` passes. Host safety: only touch files in this checkout and own temp dirs, never kill processes by name, no synthetic load.

## Decisions
- Fix by event-driven waits; no timeout increases (source: request)
- Shared single fixture build per test binary (source: request)
- Acceptance runs each test 50 times with GOMAXPROCS=2 plus structural checks of the sources (source: request)

## Source comparison
- Event-driven waits, no timeout raising: addressed in items 1 and 2 and acceptance steps.
- Fixture built once per binary: addressed by sync.Once, checked statically.
- 50-of-50 with GOMAXPROCS=2: addressed by the feature's run steps (`-race -count=50`).
- Full `go test -race ./...`: addressed by the configured go-test check and the Must-stay clause; not duplicated in the feature.
- Real code race: none identified; the opened-before-signal defect is in a test helper.

## Tests
- Open-socket test waits on opened/closed events, no 2 s timer: update provider/wait_test.go and helper (regression)
- Custody fixture shared single build, no build deadline: update sys/timeout_custody_liveness_test.go and sys/sys_test.go (regression)
- Stability 50 of 50 at GOMAXPROCS=2: acceptance scenarios (scenario)

## Feasibility
- none
