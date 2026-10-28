# Configure tool result cut budgets

Slug: l-cut
Model: not applicable — deterministic byte transformation has no meaningful state
Acceptance:
- .kogen/intents/l-cut/acceptance.feature
- features/steps/l_cut.js

Add library-only `ResultBound int` and `ResultHead int` fields on tools.Tools, independently defaulting zero to 16384/4096. Add `tools.New(options Tools) (*Tools, error)` and `(*Tools).Cut(out Output) Output`. Preserve valid existing struct literals and package Cut(string)/Output.Cut() as exact default wrappers. Validate literals at loop entry before executing tools. Run/Call remain raw-result APIs. Apply configured cutting at engine-owned result delivery; intercepted host output stays host-owned. Standalone sessions, replay, definitions and typed image results remain unchanged. No CLI/task setting or Kogen adoption.

Reject negative fields, resolved bound below 128, resolved head >= bound, and less than 64 bytes remaining after head for marker/tail. Errors clearly identify the bad option/combination. Preserve the existing algorithm with configured budgets: UTF-8-safe prefix and suffix, conservative marker reservation based on original byte count, actual absent-byte marker, total at most bound. Fitting strings remain verbatim and cutting is idempotent. Typed Output passes through entirely. Private originals are never transformed.

Update docs/contract/loop-v1.md with options, defaults, constructor, errors, wrappers and delivery ownership. Preserve every existing golden and conformance test. Shared-host tests use temporary directories, never kill by name/pattern or foreign pid and never generate synthetic CPU load.

## Decisions
- Use defaults 16384/4096 and zero-as-default (source: request)
- Preserve UTF-8-safe head/tail behavior, omission marker and typed images (source: request)
- Refuse invalid configuration at construction (source: request)

## Source comparison
- Addressed: request L-CUT options and defaults replace only the fixed policy in tools/tools.go:79,461-469; interfaces and validation are specified above.
- Addressed: 40 KB (40000-byte) and 32768/8192 examples, fitting text and invalid inputs are covered by the tests and executable acceptance below.
- Addressed: default definitions/results/replay/Cut bytes and typed images remain unchanged through existing goldens and conformance plus focused tests.
- Addressed: docs/contract/loop-v1.md is updated; configured engine delivery supersedes its default-only cut description, not host-owned interception.
- Addressed: MECHANISMS tool-result-cut motivation (322 of 3,138 reads at the 16384 cut), provisional main start on 28 October, and shared-host restrictions are retained without expanding scope.
- Addressed (correction; legacy source provenance unavailable): features/steps/l_cut.js accepts letters and digits after TestLCut, including TestLCutUTF8AndTyped required by acceptance.feature and Tests. Audited every other regex, name pattern and literal in that step file against the complete contract: step text, tools/loop packages, Go 1.27.2, anchored exact test selection, JSON line parsing, run/pass event names and counts, skip/fail rejection and bounded command timeouts remain consistent and unchanged. Every scenario and assertion remains.
- Conflicting and superseded: the former letters-only /^TestLCut[A-Za-z]+$/ check contradicted the required digit-bearing test name; only that pattern is replaced with /^TestLCut[A-Za-z0-9]+$/.
- Omitted: no requested behavior or correction; all original prose, examples, Tests, model declaration and Acceptance paths are retained. No provider research, global install, vendoring or runtime switch is needed.

## Tests
- Default Tools produce byte-identical 40000-byte cuts: add TestLCutDefaults in tools comparing with existing default algorithm and golden cases (unit)
- Bound 32768/head 8192 retains exactly the ASCII head and correct suffix/marker within bound and fitting text unchanged: add TestLCutConfigured in tools at lengths 32767,32768,32769,40000 (unit)
- UTF-8 and typed images retain their semantics: add TestLCutUTF8AndTyped in tools for 2/3/4-byte characters at both boundaries, idempotence and identical typed Output (unit)
- Invalid construction is refused clearly: add TestLCutValidation in tools for negatives, bound 127/128/129 with head 1, head at/above bound, 63/64/65 bytes remaining, valid adjacent values and independent zero defaults (unit)
- Real loop delivery uses the policy and leaves host interception unchanged: add TestLCutLoopDelivery in loop using fake provider and temporary read_file input, observing next-request and AfterCall output for 40000-byte text at 32768/8192 plus invalid literal rejection before execution (integration)
- Default definitions, results, replay and typed-image conformance stay unchanged: retain existing tools/conformance tests (existing)

Builder adds the named tests; acceptance requires each to actually run and pass, not merely a successful command with no tests. Their assertions must cover the specified observable outcomes. Run all configured checks (go-format, go-test, go-vet, go-build), README race suite and `go test ./conformance -count=1`.

## Feasibility
- Scratch Go initially failed because mise had no selected version (exit 1). After scratch trust, `mise exec go@1.27.2 -- go test ./tools -run '^TestCutMatchesTheElixirCut$' -count=1 -v` passed all golden subcases (exit 0, 1.8 s). This proves only the toolchain/default-golden route.
