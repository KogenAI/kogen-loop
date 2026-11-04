# Carry shell-start test hooks on each session

Slug: l-startup-hooks-per-run
Model: not applicable — the change replaces a package-level test hook with a nil-or-function field read at the same three fixed points of a shell start; no state, transition or production behaviour changes
Acceptance:
- .kogen/intents/l-startup-hooks-per-run/acceptance.feature
- features/steps/l-startup-hooks-per-run__seam.js
- features/steps/l-startup-hooks-per-run__harness.js

Today the tests that hold a shell at its start boundary ("enter", "starting", "started") install a package-level hook: `sys` declares `var startHook func(stage string)` (sys/sys.go), and the test packages link to it with `//go:linkname shellStartHook github.com/KogenAI/kogen-loop/sys.startHook` (conformance/shell_lifecycle_test.go and loop/tool_overlap_teardown_test.go). A package global serves only one test at a time and fires for every in-process shell start, so `conformance.TestShellLifecycleCancelStartup` and `conformance.TestShellLifecycleDeadlineStartup` (3 stages each) and the "starting shell on cancel" case of `loop.TestToolOverlapTeardown` run serially. They finish before any parallel test is released and never overlap anything. Each deadline round holds its context for 800 ms. Measured on this checkout under `-race`, the six stage rounds take 0.35–1.27 s each and about 5 s in sequence.

After this change the hook is carried by the session and so by the run. A test installs it on the `sys.Session` its round uses, and concurrent tests cannot see each other's hook. The package-level variable and both linknames are removed, and the existing startup tests move onto the per-session seam and run in parallel. Production behaviour, tool results, events, request bodies and the model-visible text are unchanged.

**The seam (sys).** `sys.Session` (sys/sys.go) gets one exported field, declared exactly as:

```go
StartHook func(stage string)
```

- Its doc comment says it is a test seam that production leaves nil. It also says the shell start calls it with "enter" before anything starts, "starting" after the process exists but before it is registered (the session is locked, so group queries wait), and "started" once it is registered.
- `New` and `NewWith` leave it nil. Nil means nothing is called, and a session behaves byte-identically to today.
- Non-nil: every command that session starts (`Run`, `RunContext` and the captured/started command path, all of which go through `runCaptured` today) calls it at the three points where `hookStart` is called today. The order, the locking and the refusal and cancellation behaviour are the same: "enter" first, before the foreign-kill refusal check; "starting" with the session lock held after `cmd.Start`; "started" after unlock. It is called only for that session's commands, never for another session's.
- The package-level `var startHook func(stage string)` and the package-level `func hookStart` are removed. Whether a session-method helper replaces `hookStart` is the Build's choice. No other package-level mutable hook variable replaces them.

**The run (loop).** `loop` gets no new exported API. A run carries the seam as the session of its `Round.Tools` (`Tools.Session`). A test sets `StartHook` on the session it passes before the round starts, and that round's shell starts call it. `loop.Run`'s implicit session (when `Tools.Session` is nil), `loop.Session`'s `sys.New()` and the CLI never set it.

**The tests moved onto the seam.**
- conformance/shell_lifecycle_test.go:
  - Remove the `shellStartHook` linkname variable and its `_ "unsafe"` import.
  - `startupRound` sets the hook on its own `newLifecycleRun` session (`l.sess.StartHook = ...`) instead of the global. No reset is needed because the session belongs to the test.
  - `TestShellLifecycleCancelStartup` and `TestShellLifecycleDeadlineStartup` call `t.Parallel()`, and so does each of their subtests: `enter`, `starting`, `started` and the deadline test's `cli`. The `cli` subtest must be parallel too, because otherwise the deadline stage rounds wait for it.
  - The comments that explain why these tests stay serial ("Serial: see startupRound" and the `startupRound` paragraph about the process-wide hook) are rewritten to say the hook is per session.
  - Every assertion, the 800 ms deadline, the 200 ms hold after the context ends and the 30 s and 10 s waits stay unchanged.
- loop/tool_overlap_teardown_test.go:
  - Remove the `shellStartHook` linkname variable and its `_ "unsafe"` import.
  - The "starting shell on cancel" case sets `f.sess.StartHook` and calls `t.Parallel()`.
  - The `TestToolOverlapTeardown` comment no longer calls it a serial parent.
  - Assertions are unchanged.
- No other test uses the hook today. No assertion is removed or loosened and no timeout is raised.

**Documentation.** docs/contract/loop-v1.md gets one sentence near the other `sys.Session` test seams and `Session.RunContext` text. It names `Session.StartHook` as a test seam: when set, the session's shell starts call it with "enter", "starting" and "started"; production leaves it nil. There is no CHANGELOG entry, because the file is no longer updated.

## Decisions
- The package-global start hooks in sys and in the loop tests' support code are replaced by a seam carried by the session (sys) and by the run (loop), unset in production. (source: request)
- A test installs its hook for its own session only, and concurrent tests cannot see each other's hook. (source: request)
- Production behaviour, tool results, events and the model-visible text are unchanged. (source: request)
- The existing startup tests move onto the per-run seam and are marked parallel. (source: request)
- The seam is the exported field `sys.Session.StartHook func(stage string)`. The run carries it through its `Round.Tools.Session`, so loop gets no new field. It is not a CLI flag, task field, config key or environment variable. (source: request)

## Source comparison
- Addressed, Problem: the package-level variables are sys's `startHook` and the two `shellStartHook` linknames in conformance and loop tests. Today they force `TestShellLifecycleCancelStartup`, `TestShellLifecycleDeadlineStartup` and the loop teardown "starting shell on cancel" case to run serially. The 800 ms context hold is kept, as the deadline test's own window under test.
- Addressed, Need "seam carried by the session (sys) and by the run (loop), unset in production": `Session.StartHook`, nil from `New`/`NewWith`, carried into a round as `Round.Tools.Session`.
- Addressed, Synthetic acceptance "Two startup rounds with different hold stages run at the same time; each stops at its own stage and neither is released or blocked by the other's hook": a Go program, not a named test. Its source is exported as a string by features/steps/l-startup-hooks-per-run__harness.js. It runs as `go run -race -overlay <file> ./zz_l_startup_hooks_per_run_accept`, a package that exists only in the overlay. It must exit 0 and print exactly `l-startup-hooks-per-run harness: ok`. On the unchanged tree it does not compile, because `sys.Session` has no `StartHook`. Round A holds at "starting" and round B at "started", each through `loop.Run` on its own session. It requires:
  - each hook to see exactly its own stages;
  - a third session without a hook to run `echo free` while both are held;
  - releasing B to finish B (`no_call`, output `exit status: 0\nround-b\n`) while A stays held at `[enter starting]`;
  - releasing A to finish A, after which each hook has seen exactly `[enter starting started]`.
- Addressed, "A session with no hook behaves byte-identically to before (same events, results, request bodies)": the built CLI runs a scripted session against a local Responses provider: `echo l-shp-one`, then `echo l-shp-two; exit 3`, then finish. The scenario compares three things with literals recorded from this base commit:
  - the outputs the model receives;
  - the full event stream, with only timing and identity fields masked as `<v>`;
  - the exact bytes (length and SHA-256) of all three request bodies, with only the random session id replaced by `<session>`.
- Addressed, "A source check finds no package-level mutable hook variable for shell start in sys or the loop tests' support code": the scan covers sys/*.go, loop/*_test.go and conformance/*_test.go. It rejects any package-level `var` whose name contains "hook" or whose declared type is `func(string)`, and any `//go:linkname` naming a `kogen-loop/sys.` symbol in any Go file.
- Addressed, "The cancel and deadline startup tests (3 stages each) pass under -race and with parallel scheduling, and their total elapsed time is no greater than the longest single round plus a small margin": the scenario runs `go test -count=1 -json -race -parallel 16 -run '^(TestShellLifecycleCancelStartup|TestShellLifecycleDeadlineStartup)$' ./conformance`. Separate steps require:
  - both tests and all seven subtests to have run and passed, as go test reported them; this already holds on the unchanged tree;
  - each of them to be marked parallel, which go test shows by printing `=== PAUSE <test>`. A failure quotes go test's own `=== RUN` and `--- PASS` lines for the test;
  - the six stage rounds together to take at most the longest round plus 1 second. Each round runs from its last run/cont record for its `Elapsed`. go test reports a parallel subtest's pass record only once earlier siblings have reported, so the record's time is not used.
  The `cli` subtest is excluded from the span because it is not a startup round (about 7.9 s under `-race`, mostly its CLI run); it only has to pass in parallel. The loop teardown case is checked separately: `go test -count=1 -json -race -run '^TestToolOverlapTeardown$' ./loop`, where `TestToolOverlapTeardown` and `TestToolOverlapTeardown/starting_shell_on_cancel` must have run and passed (true today), and the case must print `=== PAUSE`.
- Superseded: l-parallel-tests-conformance required the two startup tests to stay serial because of the process-wide hook, and l-bounded-shell-wait referred to "the serial startupRound tests". This request removes that reason and makes them parallel.
- Omitted deliberately: a loop.Round/Hooks/SessionConfig hook field (the session already carries the hook into the run), any change to the 800 ms or 200 ms windows, and a CHANGELOG entry.

## Tests
- A session's start hook is called only for that session's shell starts, at "enter", "starting" and "started", and two rounds held at different stages neither release nor block each other: acceptance harness program (`go run -race`, overlay-only package) and the restated `conformance.TestShellLifecycleCancelStartup` / `TestShellLifecycleDeadlineStartup` running in parallel (integration)
- The startup tests use the per-session seam, are marked parallel and overlap: restate `conformance.TestShellLifecycleCancelStartup`, `conformance.TestShellLifecycleDeadlineStartup` (all subtests including `cli`) and the "starting shell on cancel" case of `loop.TestToolOverlapTeardown`; acceptance runs them under `-race` and checks the pause records and the span (integration)
- No package-level mutable shell-start hook variable or linkname into sys remains: acceptance source scan (unit)
- A session without a hook keeps the same events, results and request bodies: acceptance CLI scenario against recorded base literals; existing conformance, contract and provider wire-golden tests (existing)

## Feasibility
- Repository inspection: the only shell-start hook is `var startHook` with `hookStart` at three points in `(*Session).runCaptured` (sys/sys.go:182–254). It is linked only from conformance/shell_lifecycle_test.go:30 and loop/tool_overlap_teardown_test.go:20. No external protocol, library or provider is involved, so no documentation lookup was needed. The shell supervisor is disabled in test binaries (`supervisorAvailable`), so the overlaid harness needs no TestMain.
- Base timing (`go test -race -count=1 -json -run '^(TestShellLifecycleCancelStartup|TestShellLifecycleDeadlineStartup)$' ./conformance`): serial. Cancel rounds took 0.35, 0.48 and 0.47 s, deadline rounds 1.15, 1.26 and 1.27 s, and `cli` 7.87 s, for a total of 12.9 s. With a known-good seam applied through overlays (field and calls in sys, the tests patched to set the session hook and call t.Parallel), all subtests overlapped. The six rounds spanned about 1.3 s against a longest round of 1.27 s.
- `go run -race -overlay` builds and runs a main package whose directory exists only in the overlay (probe: exit 0, about 2 s). Nothing is written to the tree. `go test` cannot be used for that, because it fails to chdir into a missing directory. A named acceptance test would also be one the Build has to invent.
- The no-hook CLI observation was deterministic across two runs of the base build once the session id (also the `prompt_cache_key`) and timing fields were masked. `capabilities_digest` covers only platform-independent capabilities.
- evidence: {"id":"startup-hooks-observer","kind":"observer","inputs":["features/steps/l-startup-hooks-per-run__seam.js","features/steps/l-startup-hooks-per-run__harness.js"],"observers":["features/steps/l-startup-hooks-per-run__seam.js","features/steps/l-startup-hooks-per-run__harness.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/l-startup-hooks-per-run__seam.js --control good","exit":0,"output":"l-startup-hooks-per-run observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/l-startup-hooks-per-run__seam.js --control bad","exit":1,"output":"l-startup-hooks-per-run observer rejected\n"}]}
- The good control first requires the feature's model outputs, masked events and request-body rows to equal the recorded base observation. A one-character change to an event fails it. It then applies a known-good seam through overlays only and requires all observers to accept. Those are the harness, the ran-and-passed, parallel and span checks, the teardown checks, the scan of the patched sources, and the base CLI against the recorded literals. It also requires the unchanged tree's real startup and teardown runs to be accepted as having run and passed. The bad control requires rejection of:
  - the unchanged tree's harness, which does not compile without `StartHook`;
  - a hook field that is ignored;
  - a first-session-wins process-wide hook;
  - the serial base startup tests, both for parallel marking and for the span;
  - the serial base teardown case;
  - the base tree's three variables and two linknames, listed exactly;
  - a test name that never ran;
  - a changed request body, an extra event field and a missing event.
  Both controls passed locally from the unchanged checkout. The bad control took 62 s. The good control took 4 min 12 s on a heavily loaded host; its parts take about 2 s (harness), 15 s and 20 s (base runs) when the host is not loaded.
