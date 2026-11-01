# Parallelize independent provider tests

Slug: l-parallel-tests-provider
Model: not applicable — scheduling tests changes no product state machine
Acceptance:
- .kogen/intents/l-parallel-tests-provider/acceptance.feature
- features/steps/l_parallel_tests_provider.js

Make safe parallel execution the default for independent provider tests. Implementation edits are confined to provider/*_test.go including shared helpers there. No production edits or other packages' test edits. Audit every top-level test and independent subtest; retain all cases, names and assertions, including protocol, real process/signal cleanup, timeout, race and failure propagation coverage. Never rename the existing random TempDir-bearing subtest.

newEnv already provides private HOME, credentials, sessions, fake servers and clocks: preserve that isolation. Do not concurrently mutate idlePoll. Keep driveIdle callers, TestStreamIdleBlocked and package-global liveWatches zero assertions in documented serial top-level tests without parallel descendants. The sequential/parallel top-level scheduling barrier isolates this shared-state group from parallel tests. Document every other remaining serial group and concrete interference reason in comments; this is not permission to serialize independent tests. Do not add production mocking seams.

Replace measured fixed padding with readiness events where waiting is not itself under test, particularly refresh/held-lock and login-interruption setup. Retain waits testing time or non-occurrence. No new command, flag or option; no timeout, retry or limit change; no paid provider requests.

Before editing retain three uncached MacBook runs of `go test -json -count=1 ./provider` and three matching after runs, same Go 1.27.2 toolchain, machine and source scope. Record command wall times, failures, environment and medians in delivery evidence; demonstrate a shorter after median. Report cache hits and queue wait separately, never as uncached execution. Run `go test -race -count=1 ./provider` before and after and report race behavior. Full `go test ./...` and configured checks must stay green. Compare complete test/subtest inventories by per-test counts, replacing only the random TempDir path with a placeholder; explain this normalization explicitly. No removed, skipped, suppressed or zero-run tests may explain the speedup; added tests may add inventory entries. Do not write a CHANGELOG entry.

Executable acceptance exercises the actual default provider scheduling entry point. Final review must additionally check the complete audit, inventory and repeated timing evidence, not merely presence of a single parallel test.

## Decisions
- Keep this split provider-only, not conformance or sys+tools (source: request)
- Keep random TempDir-bearing names unchanged and normalize measurement evidence (source: request)
- Use offline fake providers and private test resources (source: request)

## Source comparison
Addressed: Studio issue fc2fece0-5229-4873-b884-a17daf122466, L-PARALLEL-TESTS-PROVIDER fix, owner priority 31 Oct test-suite speed first maps to provider-only scheduling, audit and repeated measurement requirements above and executable default-scheduling scenario. Addressed: idlePoll mutations in driveIdle and TestStreamIdleBlocked map to documented serial barrier isolation; blind parallelization is prohibited. Addressed: 1 Nov 2026 random TempDir constraint maps to unchanged names and normalized inventories above. Addressed: no commands/options, timeout/retry/limit changes, paid calls, weakened coverage or other-package test edits maps to boundaries above and existing full checks.

Superseded as acceptance evidence, not contradicted: Build 7d72b6bd was green but review material was 626,778 bytes versus 524,288-byte ceiling. Its single provider 15.2 s to 5.7 s result is context only; fresh repeated measurement is required. Historical MacBook total 41–48 s, conformance 40–46 s, sys 33–36 s and provider 12–23 s are not thresholds. The recorded audit of zero parallel calls and provider 199 versus conformance 74 top-level tests motivates the change, not a hardcoded current inventory. No prior candidate diff was present in inspected inputs; the contract does not depend on an unconsumed candidate pointer. No requested behavior is deliberately omitted.

## Tests
- Independent tests run in parallel by default: actual Go JSON pause and continue events and passing provider result (regression)
- Resource isolation retains behavior: repeated uncached provider runs, race runs and normalized complete inventory comparison (existing)
- Readiness replaces padding without weakening time and cleanup coverage: existing affected provider tests with unchanged behavioral assertions (existing)
- Other packages remain green: full `go test ./...` and configured checks (existing)

## Feasibility
- Documentation search for Go parallel testing returned sources including go.dev. Fetch https://go.dev/pkg/testing/ returned retrieved but untrusted content; https://pkg.go.dev/testing find returned not_found/untrusted. Neither is claimed as trusted protocol proof. Repository inspection identifies the shared-state serial group.
- evidence: {"id":"parallel-observer","kind":"observer","inputs":["features/steps/l_parallel_tests_provider.js"],"observers":["features/steps/l_parallel_tests_provider.js"],"checks":[{"name":"good","command":"node features/steps/l_parallel_tests_provider.js good","exit":0,"output":"parallel observed\n"},{"name":"bad","command":"node features/steps/l_parallel_tests_provider.js bad","exit":1,"output":"parallel missing\n"}]}
