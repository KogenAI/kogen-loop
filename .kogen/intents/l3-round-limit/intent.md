# Add round limit and no-progress stop to loop.Run

Slug: l3-round-limit
Model: not applicable — two counters inside one function; no interacting state worth a model
Acceptance:
- .kogen/intents/l3-round-limit/acceptance.feature
- features/steps/round_limit.js
- features/steps/round_limit_test.go.txt

`loop.Run` gains two optional, caller-enabled safety stops. Neither has a default, and callers that set neither behave exactly as today (same requests, same results; no timeout or retry is added). Kogen's vendored copy and pin are not touched.

A "round" here is one request/response cycle of the engine loop in `Run` (one iteration; `Result.Requests` counts them).

**Public API (names fixed; the acceptance collector compiles against them):**
- `loop.Round.MaxRounds int`: 0 means no limit. When a round has just finished with all its calls run, did not end (no terminal call, at least one call, i.e. the loop would send another request) and the number of requests sent has reached `MaxRounds`, `Run` stops. A terminal or no-call ending on the limit round is a normal result.
- `type loop.RoundLimitError struct{ Rounds int }` (pointer receiver `Error()`, found with `errors.As` into a `*RoundLimitError`); `Rounds` is the number of rounds run (= MaxRounds). `Run` returns it as the error together with a Result whose `Input`, `Response` and `Requests` describe the last round (`Ending` empty); tools already run are not undone, and the last candidate is left as is.
- `loop.Hooks.Progress func(ctx context.Context, round int) (string, error)`: nil disables the no-progress stop. When set, it is called after each round that did not end (after its calls), with the 1-based round number, and returns the progress fingerprint (e.g. candidate-tree identity plus failing-check identity). An error from it stops the run and is returned unchanged, like other hook errors.
- `const loop.NoProgressRounds = 3`, a named constant (shared with Kogen's rule), not a setting.
- `type loop.NoProgressError struct{ Rounds []int; Fingerprint string }` (pointer receiver `Error()`): when `NoProgressRounds` consecutive rounds return an identical fingerprint, `Run` stops and returns it with `Rounds` the consecutive round numbers (e.g. `[1 2 3]`) and the fingerprint; the Result is populated as for the round limit. Any differing fingerprint resets the count (a fresh fingerprint counts as 1).
- Order after a continuing round: Progress hook, no-progress check, then round-limit check (so no-progress wins when both trigger on the same round).

Docs: README.md and `docs/contract/loop-v1.md` (and package doc in loop/loop.go) describe `MaxRounds`, `Hooks.Progress`, `NoProgressRounds` and both typed errors, and state explicitly that neither has a default (the phrase "no default").

## Decisions
- Round limit counts requests of one `Run`; 0 = unlimited, no invented default (source: request)
- No-progress is enabled only by supplying `Hooks.Progress`; threshold 3 is a constant (source: request)
- Typed errors (not Ending values) carry the round count / rounds and fingerprint (source: request)
- Hook signature `(ctx, round) (string, error)` and no-progress-before-limit precedence are shaper choices for determinism (source: request)

## Source comparison
- Round.MaxRounds, 0 = no limit, typed result with round count, last candidate untouched: addressed (RoundLimitError).
- Optional per-round fingerprint hook, 3 identical stop, reset on change, typed result naming rounds and fingerprint, disabled by default: addressed (Hooks.Progress, NoProgressError, NoProgressRounds).
- Docs saying neither has a default: addressed.
- Unchanged behavior without either setting: addressed by existing tests plus the MaxRounds 0 / nil hook scenarios.
- go test -race ./... incl. conformance: configured checks and existing tests remain; Kogen vendored copy: out of scope.

## Tests
- MaxRounds stops a never-converging fake with RoundLimitError and its count; a terminal on the limit round is a normal ending: scenarios 1 and 3 in acceptance.feature (scenario)
- MaxRounds 0 continues past the number: scenario 2 (scenario)
- Three identical fingerprints stop with rounds and fingerprint; change resets; disabled never stops; precedence over round limit: scenarios 4-7 (scenario)
- Docs mention both without defaults: scenario 8 (scenario)
- Behavior unchanged for callers setting neither: existing loop and conformance tests (existing)

## Feasibility
- none
