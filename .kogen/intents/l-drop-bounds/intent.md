# Remove optional loop stopping bounds

Slug: l-drop-bounds
Model: not applicable — removes optional stopping policy and its tracking state; introduces no state machine or new transition, retaining the existing terminal, no-call and error paths
Acceptance:
- .kogen/intents/l-drop-bounds/acceptance.feature
- features/steps/l_drop_unused.js

Remove L21 `loop.Round.MaxRounds` and `RoundLimitError`, and L22 `loop.Hooks.Progress`, `NoProgressRounds` and `NoProgressError`, including their implementation, bookkeeping and documentation. A continuing tool-call response continues without a round-count or progress-fingerprint stop. A round ends only by terminal, no-call or error (including existing context cancellation/deadline and custody errors). Preserve all other behavior and default bytes. These unused/default-disabled mechanisms are deleted, not replaced by settings or a finite hardcoded bound. There is no surviving numeric constant to test.

## Decisions
- Apply Almir's 29 October 2026 principle, "don't overengineer, simpler is always better": remove options rather than deprecating them or introducing substitutes. No CLI command, flag or task/protocol change. (source: request)
- Defaults remain byte-identical: formerly MaxRounds=0 and Progress=nil already meant neither stop was active. State this in the commit body; no finding changes a default in this scope. (source: request)
- Delete only the round-limit subcase of `loop/terminal_reminders_test.go`; retain its no-call, terminal and session-event tests and shared helpers. Delete `.kogen/intents/l3-round-limit/acceptance.feature` and its obsolete, exclusively round-limit acceptance helpers `features/steps/round_limit.js` and `features/steps/round_limit_test.go.txt`. Preserve other useful default-behavior tests unchanged. (source: request)
- Remove the obsolete optional-stop section from `docs/contract/loop-v1.md` and the optional-stop paragraph/link from `README.md`; update `CHANGELOG.md` so its current unreleased account no longer advertises these options. Preserve unrelated documentation and historical provenance. (source: request)
- This is the standalone kogen-loop change after Kogen K-NROUNDS-REMOVE and K-NOPROG-REMOVE. Do not edit Kogen setters or events here, vendored `cli/third_party/kogen-loop/**`, or `cli/loop-pin.json`; adoption is a separate re-pin. Never replace binaries used by live climbs, install globally, restart or stop live runs. Queued climbs re-register as uncommitted patches on the new sha. (source: request)
- Shared-host safety: private temporary directories only; no synthetic CPU load; never stop processes by name or pattern, and only signal pids started by the test. No paid providers or live experiments. (source: request)

## Source comparison
- Addressed: request L-DROP-BOUNDS, audit source `operations/build-notes/delivery/options-audit-20261029.md` intent LI-2, L21/L22: the complete removal is specified above and checked by `TestDropBoundsRemoved`. The audit file is not present in this repository; the supplied scope and rulings are authoritative, not inferred extra audit findings.
- Superseded: `loop/loop.go` currently exposes MaxRounds, Progress, NoProgressRounds=3 and both typed errors and tracks request/streak stopping policy; README line 33, contract section "Round limit and no-progress stop (Go library)" and CHANGELOG currently advertise it. Remove that policy, not request counting in Result or unrelated error/cancellation behavior.
- Addressed: request acceptance requires default-behavior tests unchanged and all configured checks; `TestDropBoundsDefaultBehavior` exercises public Run, `TestDropBoundsDocumentation` checks maintained docs/obsolete feature, and configured checks run unchanged. No hardcoded replacement value exists: delete the unused NoProgressRounds constant rather than retaining 3.
- Addressed boundaries: K8 (`executor_native.go:123 MaxRounds`, shape/refine `NativeRoundLimits`) and K10 (`Role.NoProgress`, Progress hook, `build.go:99`, `stop.go:133`, noprogress paths, `native_no_progress` and `native_round_limit`) belong to prerequisite Kogen Intents K-NROUNDS-REMOVE and K-NOPROG-REMOVE, not this standalone repository's edits. No rollout or prerequisite completion is claimed here.
- Addressed ruling context without expanding scope: live C3 AuthorityBoundary, C4 InputBudgetBytes, UT4 DisableParallelToolCalls and K-REVOD review_material remain patch lanes on frozen shas; queued UT8, C5, #15, L-NUDGE and K11 run as patches on 16102c9. A yes result requires a new Intent. Do not change these options or experiments here. No request behavior is intentionally omitted; these are operational boundaries, not authorization to mutate live runs.

## Tests
- Removed public options and typed stops no longer exist: add `conformance.TestDropBoundsRemoved`, using reflection for Round.MaxRounds/Hooks.Progress and Go AST exported package declarations for RoundLimitError, NoProgressRounds and NoProgressError, checking actual package source rather than comments or historical Intent prose (integration)
- Continuing responses retain the unlimited/default-disabled behavior until terminal, no-call or error: add `conformance.TestDropBoundsDefaultBehavior` calling real `loop.Run` with a finite fake Requester, repeated identical handled nonterminal calls for at least four responses, then separate terminal/no-call/requester-error endings; assert exact request counts, Ending/Terminal and replayed outputs, and unchanged sentinel error identity; retain existing cancellation and terminal-batch tests unchanged (integration)
- Obsolete bound tests/docs are removed while useful coverage remains: add `conformance.TestDropBoundsDocumentation` checking absence of the l3-round-limit feature and obsolete helpers, absence of removed option documentation in maintained README/contract, and an accurate removal entry in CHANGELOG; keep other tests in terminal_reminders_test.go (integration)
- All default behavior outside deleted stop-only tests remains unchanged: run configured go-format, go-test, go-vet and go-build plus README's `go test -race ./...` and `go test ./conformance -count=1`; do not weaken checks or edit unrelated tests to obtain green (existing)

## Feasibility
- none
