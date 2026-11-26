# Reject overflow in provider usage invariants

Slug: provider-usage-invariant-overflow
Model: not applicable — the result is a stateless classification of one set of counts
Acceptance:
- .kogen/intents/provider-usage-invariant-overflow/acceptance.feature
- features/steps/provider-usage-invariant-overflow__state.js
- features/steps/provider-usage-invariant-overflow__driver/main.go

Make `(KnownUsage).State() string` return `UsageInconsistent` (`"inconsistent"`) if either checked sum of nonnegative counts overflows the Go target's `int`. Replace unchecked arithmetic in the existing consistency checks: when `Input`, `Cached`, and `Write` are present, the mathematical sum of `Cached` and `Write` must be at most `Input`; when `Write`, `Write30m`, and `Write12h` are present, the mathematical sum of `Write30m` and `Write12h` must equal `Write`. A sum above `math.MaxInt` fails its check, even when each operand individually fits within the reported total. Inconsistency wins over completeness. A fully reported valid set still returns `UsageKnown` (`"known"`) even at the limit. There is no error return. (evidence: provider/usage.go)

Keep the shared validation path, existing nil handling, subset checks, and ordinary consistency outcomes. Limit implementation and unit-test edits to `provider/usage.go` and `provider/cache_test.go`. Do not change usage fields, provider response parsing, other usage arithmetic, or documentation files. (evidence: provider/usage.go; provider/cache_test.go; provider/stream.go)

## Decisions
- Make the two existing relations overflow-safe in the shared classifier used by `KnownUsage.State`, without changing when the relations apply. (evidence: provider/usage.go; provider/stream.go) (source: request)
- Use the target's `math.MaxInt` as the inclusive upper boundary in tests, so valid counts at that boundary are not rejected solely for their size. (evidence: provider/usage.go; go.mod) (source: request)

## Source comparison
- Superseded: `ev-d304586c` identifies unchecked `int` additions in `provider/usage.go` and a boundary coverage gap in `provider/cache_test.go`. The outcome above replaces unchecked comparisons, and `## Tests` adds focused coverage without replacing the ordinary cases.
- Addressed: Acceptance 1 maps to “Cached and write counts overflow together”; the unchanged addition wraps and lets that disjoint check pass. Acceptance 2 maps to “Individually in-range write lifetimes overflow together”; the old equality already rejects this case, but deleting the relation makes it pass as `UsageKnown`. Each overflow scenario satisfies the other relation so the assertion isolates the intended check.
- Addressed: Acceptance 3 maps to the three `known` scenarios at and immediately below the limit; the controls reject treating the maximum as exclusive in either relation.
- Omitted by scope: changes to fields, parsing provider responses, ordinary consistency rules, and documentation. Only `provider/usage.go` and `provider/cache_test.go` need Build edits; the two scoped step artifacts drive `KnownUsage.State` directly. No conflicting requirements found.

## Tests
- Reject a cached-plus-write overflow even when the individual counts fit: add a disjoint-overflow case to `TestKnownUsageStateIntBoundary` in `provider/cache_test.go` (regression)
- Reject an overflowing lifetime split even when the individual counts fit: add a lifetime-overflow case to `TestKnownUsageStateIntBoundary` (unit)
- Keep representable sums at and immediately below the maximum classified as known when valid: add the adjacent valid cases to `TestKnownUsageStateIntBoundary` (unit)
- Preserve ordinary inconsistency, valid counts, and partial and unknown states: keep `TestUsageValidatesDisjointWritesAndSubsetReasoning` (evidence: provider/cache_test.go) (existing)

## Feasibility
- The steps run `go run ./features/steps/provider-usage-invariant-overflow__driver/main.go` in the module root with seven count strings in feature order: `Input`, `Cached`, `Write`, `Write30m`, `Write12h`, `Output`, `Reasoning`. The driver resolves `max`, `max-1`, and `max-2` using `math.MaxInt` and parses the other arguments as nonnegative decimal ints. It supplies all seven as non-nil pointers. Stdout is the exact state plus a newline, not a Go process exit code; invocation failures are harness failures. Malformed input makes the driver write a diagnostic on stderr and exit 2. No provider service or credentials are involved. (evidence: provider/usage.go; go.mod; .kogen/project.yaml)
- The probe observed Go 1.27.2 on darwin/arm64, Node v24.21.0 and Cucumber 13.3.0. The driver is gofmt-clean, the direct cached/write overflow run on unchanged code produced `known\n`, and the ordinary usage test passed. The 32-bit boundary was not run here. (probe: exit 0, 1.9 s)
- The generated correct overlay and four wrong overlays applied and compiled in scratch. (probe: exit 0, 1.8 s)
- The final observer read real driver results for a valid boundary and an overflowing lifetime split. The good check accepted both exact outputs; the bad check confirmed both swapped classifications reached and failed the same assertion used by Cucumber. (probes: good exit 0, 0.9 s; bad exit 1, 0.7 s)
- evidence: {"id":"usage-state-observer","kind":"observer","inputs":["provider/usage.go","features/steps/provider-usage-invariant-overflow__state.js","features/steps/provider-usage-invariant-overflow__driver/main.go"],"observers":["features/steps/provider-usage-invariant-overflow__state.js","features/steps/provider-usage-invariant-overflow__driver/main.go"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/provider-usage-invariant-overflow__state.js good","exit":0,"output":"state observer accepted known and inconsistent results\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/provider-usage-invariant-overflow__state.js bad","exit":1,"output":"state observer rejected swapped results\n"}]}
