# Add an on-demand slow-test budget report

Slug: l-slow-test-budget-report
Model: not applicable — the script makes one pass over one finished `go test -json` stream and keeps no state between runs
Acceptance:
- .kogen/intents/l-slow-test-budget-report/acceptance.feature
- features/steps/l-slow-test-budget-report__report.js

Waiting tests slip back in unnoticed. Earlier waits of 45 seconds per test pushed the suite to 118-317 s before they were fixed, and today a handful of tests still sit at 5-11 s on real signal escalation. Nothing in the repository reports test durations, so the next slow test is found only when someone reads a one-off run. This change adds a small on-demand script that reports any single test that waits on real time at or above a bound, and fails when such a test is not on an explicit, commented allowlist.

Boundaries: no change to production code, tests, test timeouts, configured checks or the default `go test ./...` flow. The script is not run by `go test ./...`, `go vet ./...` or `go build ./...` and is not added to `.kogen/project.yaml`.

**Files.**

1. `scripts/slowtests.go` (new): one Go file, standard library only, whose first line is `//go:build ignore` followed by a blank line and `package main`, so `./...` patterns never match it (observed: `go list ./...`, `go vet ./...` and `go build ./...` skip such a file, while `go run scripts/slowtests.go` and `go build -o <bin> scripts/slowtests.go` build it). It must be gofmt-formatted (the go-format check covers it). Run it from the module root as `go run scripts/slowtests.go [-threshold <duration>]`.
2. `scripts/slowtests-allowlist.txt` (new): the repository's allowlist (format below).
3. `README.md`: in the `## Test` section, directly after the fenced command block and before `## Navigation`, add this paragraph:

   `go run scripts/slowtests.go` reports, on demand, each package's wall time and every test that takes 2 s or longer, and exits non-zero when such a test is not listed with its reason in `scripts/slowtests-allowlist.txt`. It is not part of `go test ./...`.

**Command interface.**

- Flags: only `-threshold <Go duration>` (parsed with `time.ParseDuration`), default `2s`. A value that does not parse or is not positive, an unknown flag or any positional argument is a usage error.
- Allowlist: the script reads `scripts/slowtests-allowlist.txt` relative to the working directory, before starting `go`. A missing file means an empty allowlist. Each line is trimmed; blank lines and lines starting with `#` are comments. Every other line is an entry `<import path> <TestName> # <reason>`: exactly two whitespace-separated fields before the first `#`, and a non-empty reason after it. A malformed entry (no `#`, not exactly two fields, empty reason) or an unreadable file is a usage error whose message names `scripts/slowtests-allowlist.txt:<line number>:` for a malformed entry.
- Run: exactly one child process, `go test ./... -count=1 -json`, with `go` resolved from `PATH`, in the working directory, with the inherited environment; no other arguments (in particular no `-timeout`, so the default timeouts apply). The child's stdout is decoded line by line as `go test -json` events (lines that are not JSON objects are ignored); the child's stderr is discarded, never forwarded.
- Only top-level tests are judged: an event whose `Test` contains `/` is a subtest and is never printed; its time is part of its parent's `Elapsed`, so a slow subtest is reported under its parent's name. A test's duration is the `Elapsed` of its final `pass`, `fail` or `skip` event; a package's wall time is the `Elapsed` of the package's final `pass`, `fail` or `skip` event (no `Test` field).

**Output (stdout), in this order.**

Durations are printed as seconds with two decimals followed by `s` (`fmt.Sprintf("%.2fs", elapsed)`). Fields are separated by single spaces. Nothing else is printed on stdout: no headers, no test output or log lines, no allowlist reasons.

1. `package <action> <duration> <import path>` for every package with a final package event, `<action>` being `pass`, `fail` or `skip`, sorted by import path.
2. `slow <duration> <import path> <TestName> over|allowed` for every top-level test whose final action is `pass` or `skip` and whose `Elapsed` is at or above the threshold, sorted by duration, longest first (ties by import path, then test name). `allowed` when the allowlist has that import path and test name, otherwise `over`.
3. `failed <duration> <import path> <TestName>` for every top-level test whose final action is `fail`, whatever its duration, sorted by import path then test name. A failed test is never printed as `slow`.
4. `stale <import path> <TestName>` for every allowlist entry for which the run produced no event of that top-level test in that package, in allowlist order.

Example against a module with a 50 ms `TestFast` in `example.com/synth/fast` and a 3 s `TestSlow` in `example.com/synth/slow`, no allowlist (exit 1):

```
package pass 0.32s example.com/synth/fast
package pass 3.27s example.com/synth/slow
slow 3.00s example.com/synth/slow TestSlow over
```

**Exit status.**

- `2`: usage error or allowlist error (above), or `go` cannot be started; an error message on stderr (for threshold and allowlist errors it starts with `slowtests: `), nothing on stdout, and `go` is not run for flag and allowlist errors.
- `1`: at least one `over` line, `failed` line or `package fail` line, or `go test` itself exited non-zero.
- `0`: otherwise. `allowed` and `stale` lines do not change the status. stderr stays empty.

**The repository allowlist.**

`scripts/slowtests-allowlist.txt` starts with a comment block that explains the entry format and that an entry is only for a test that must wait on a real binary, a real signal or a real network-free timer. Every entry's reason starts with `real binary`, `real signal` or `real network-free timer`, followed by `: ` and what the test waits on. The Build fills it from one real run of `go run scripts/slowtests.go` in this repository: each test reported `over` that waits on a real binary, a real signal (such as the 5-11 s signal-escalation tests) or a real network-free timer gets an entry naming its import path (under `github.com/KogenAI/kogen-loop`) and its top-level test function, which must exist in that package's `_test.go` files. A slow test that fits none of these reasons is not allowlisted and is not changed; the Build reports it. Entries for tests in platform-specific files (for example `_linux_test.go`) may print as `stale` on other platforms; that is expected.

## Decisions
- The script runs on demand as `go run scripts/slowtests.go` and is not part of the default `go test ./...` flow or the configured checks (source: request)
- It runs exactly `go test ./... -count=1 -json` with the default timeouts and judges each top-level test at or above `-threshold` (default `2s`) (source: request)
- Output lists per-package wall time, then slow tests longest first, failed tests and stale allowlist entries, carrying only test names, package names and durations (source: request)
- Subtests are folded into their parent: only the parent's name and duration are printed (source: request)
- A failing test is printed as `failed`, never as `slow` (source: request)
- The allowlist `scripts/slowtests-allowlist.txt` is commented and every entry records its reason (real binary, real signal, real network-free timer) (source: request)
- An allowlist entry naming a test that no longer exists is reported as `stale` (source: request)

## Source comparison
- Addressed: "a small script in the repository (run on demand, not part of the default test command)": `scripts/slowtests.go` with `//go:build ignore`; acceptance checks `go list ./...` lists nothing under `scripts` and README documents `go run scripts/slowtests.go`.
- Addressed: "runs `go test ./... -count=1 -json`" and "runs with the default timeouts": acceptance records the exact argument list `test ./... -count=1 -json` through a `go` wrapper on `PATH`.
- Addressed: "prints per package wall time plus every test at or above a threshold (default 2 s) sorted by duration": `package` and `slow` lines; acceptance checks exact line order including two slow tests longest first, and a `-threshold 10s` run.
- Addressed: "exits non-zero when a test not on an explicit, commented allowlist (real binary, real signal, real network-free timer) exceeds the threshold. The allowlist records the reason for each entry": exit 1 with `over`; mandatory reason; repository allowlist reasons start with one of the three categories, checked by acceptance.
- Addressed: synthetic acceptance "one 50 ms test and one 3 s sleeping test, the script lists only the 3 s test and exits non-zero; with that test on the allowlist it exits zero and still prints it": first two scenarios.
- Addressed: "Subtests are reported under their parent name; a failing test is reported as failed, not as slow": subtest and failing-test scenarios.
- Addressed: "Output carries test names, package names and durations only": the output scenario asserts the exact lines and that test log and stdout text never appear.
- Addressed: "An allowlist entry naming a test that no longer exists is reported as stale": stale scenario.
- Addressed: "No change to production code, tests, timeouts or the default `go test` flow": stated boundary; the configured checks run unchanged and acceptance checks the script stays outside `./...`.
- Decided technically (not in request): entries name `<import path> <TestName>` so equal test names in different packages stay distinct; exit 1 also for failed tests and failed packages, because such a run is not a complete green timing; exit 2 for usage and allowlist errors, with an entry lacking a reason refused before `go` runs; a missing allowlist file is an empty allowlist; `stale` lines do not change the exit status, since the request only asks to report them.
- Preserved literals: 45 seconds per test, 118-317 s suite, 5-11 s signal escalation, `go test ./... -count=1 -json`, default threshold 2 s, 50 ms and 3 s synthetic tests.

## Tests
- Only tests at or above the default 2 s threshold are listed and a non-allowlisted one exits 1: synthetic-module scenario with a 50 ms and a 3 s test (scenario)
- An allowlisted slow test exits 0 and is still printed as `allowed`: synthetic-module scenario with the allowlist file (scenario)
- `-threshold` changes the bound: synthetic-module scenario with `-threshold 10s` listing no test and exiting 0 (scenario)
- Subtests are folded into their parent and slow tests are sorted longest first: synthetic-module scenario with a 3.5 s subtest and a 2.5 s sibling (scenario)
- A failing test is printed as `failed`, not `slow`, and exits 1: synthetic-module scenario with a failing 3 s test (scenario)
- Output carries only names and durations, and `go test` runs with exactly `./... -count=1 -json` and default timeouts: synthetic-module scenario with test log and stdout noise and a `go` wrapper on `PATH` (scenario)
- A stale allowlist entry is printed as `stale` without changing the exit status: synthetic-module scenario (scenario)
- An allowlist entry without a reason exits 2 before `go` runs: synthetic-module scenario (scenario)
- The repository allowlist is commented, each entry names an existing test with a reason in one of the three categories, README documents the script and `./...` excludes it: repository scenario (scenario)
- Production code, tests, timeouts and the default `go test` flow are unchanged: the configured go-format, go-test, go-vet and go-build checks (existing)

## Feasibility
- none
