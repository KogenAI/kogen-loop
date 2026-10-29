# Remove unused loop options

Slug: l-drop-unused
Model: not applicable — removing configuration branches leaves existing default state transitions unchanged
Acceptance:
- .kogen/intents/l-drop-unused/acceptance.feature
- features/steps/l_drop_unused.js

Implement L-DROP-UNUSED (change_type: removal), Studio record `kogen-loop/drop-unused-options`, source `operations/build-notes/delivery/options-audit-20261029.md`, intent LI-1. Almir's principle, confirmed 29 Oct 2026: "don't overengineer, simpler is always better". Options are wrong by default; the finding is hardcoded as the only behaviour. No caller outside tests in Kogen or cmd/kogen-loop sets these options. Add no option and preserve byte-identical default requests, events and results. Do not modify Kogen consumers, vendoring, pins or installations.

Remove provider.Request.AnthropicCacheTTL and provider.CacheTTLHour: Messages cache breakpoints always use the existing default five minutes, with no explicit ttl. Remove provider.Request.Budget: the absolute logical-response budget comes only from Client.ResponseBudget or the existing 30-minute constant. Keep client validation (zero or 1 second through 30 minutes), fake-clock behavior and client diagnostics.

Remove loop.Direct.Policy and loop.ContextPolicy. Make the existing FailOverBudget refusal a plain mandatory check inside Direct; retain the callable FailOverBudget helper where existing default-behaviour tests use it. Do not add a replacement policy seam. Preserve rendered-body measurement, InputBudgetBytes validation, typed refusal before transport, no clipping, cache identity and parallel-control forwarding.

Remove loop.Round.StopAfterTerminal and loop.SkippedAfterTerminal. Always use today's unset behavior: process the complete batch, including calls after a terminal, and select the last terminal. Existing cancellation, interrupt and hook-error precedence still applies; terminal calls themselves keep existing no-execution/no-output semantics. Remove loop.SessionConfig.CacheID: NewSession and ResumeSession always use the generated/restored session ID as provider cache identity. Retain Direct.CacheID and provider.Request.CacheID; those are not requested removals.

Delete provider/breakpoint_ttl_test.go, loop/stop_after_terminal_test.go and conformance/session_cache_id_test.go, and obsolete assertion features .kogen/intents/l-ttl/acceptance.feature, .kogen/intents/l-termstop/acceptance.feature and .kogen/intents/l-cachekey/acceptance.feature. Before deletion, preserve useful default-only coverage from those files in surviving tests, particularly off_compatibility batch assertions. Keep every other default-behaviour test unchanged except necessary compilation/expectation updates for removed fields. Edit conformance/library_test.go and loop/input_budget_test.go to remove custom-policy-only assertions and preserve default checks; the Requester sent-input contract is not removed. Rewrite all Request.Budget test uses to Client.ResponseBudget using the existing fake clock; do not use subsecond client values. Update tests and older feature expectations of removed budget precedence, including l-respbudget, without weakening surviving client-budget coverage. Update exact public-field inventories such as provider/stream_idle_test.go.

Update docs/contract/loop-v1.md and README.md to describe only surviving behavior, removing obsolete options and policy-extension claims. Update CHANGELOG.md to drop obsolete option claims and add one changelog line naming the five removals. Historical provenance need not be rewritten. All configured checks must pass, plus the README's race and conformance checks. Shared-host safety: use temporary directories only for fixtures; no synthetic CPU load; never stop processes by name or pattern, only PIDs started by the test/run.

## Decisions
- Keep only existing unset behavior, without replacement knobs (source: request)
- Session cache identity is always its session ID; every batch runs and the last terminal wins (source: request)

## Source comparison
- Addressed: request Remove and Acceptance map to the five API removals above and TestUnusedOptionsRemoved; reflection covers removed fields and isolated negative go-build cases cover removed interface/constants and field initializers.
- Addressed: request Loop default and Must stay map to byte-identical default behavior, retained default tests, mandatory budget check and TestEngineOrder; no new option is permitted.
- Addressed: request Tests maps to the three named test-file deletions, obsolete feature deletions, migration of default-only coverage, Policy call-site edits and fake-clock client-budget rewrites. Observed off_compatibility assertions must survive outside the deleted file.
- Addressed: request documentation, configured checks and Host safety map to the documentation/check/safety requirements above. Audit path and LI-1 are request-supplied attribution, not a claim that the audit exists locally.
- Superseded: old l-ttl, l-termstop and l-cachekey feature assertions and old Request.Budget precedence are deliberately removed. No requested behavior is omitted; no external/provider change or live research is required.

## Tests
- Removed fields, interface and constants cannot be used by Go callers: add conformance.TestUnusedOptionsRemoved with reflection checks for all five removed fields and isolated temporary Go modules using a local replace for this module; first build a valid default caller, then independently require go build failures naming each removed member for provider.Request.AnthropicCacheTTL, provider.Request.Budget, provider.CacheTTLHour, loop.Direct.Policy, loop.ContextPolicy, loop.Round.StopAfterTerminal, loop.SkippedAfterTerminal and loop.SessionConfig.CacheID (integration)
- Complete batches run and the last terminal wins with unchanged outputs and hooks: retain TestEngineOrder unchanged and migrate default-only off_compatibility assertions before deleting the obsolete test file (existing)
- Default request/cache/event/result behavior remains byte-identical: retain default provider, session, conformance and input-budget tests, including default cases extracted from deleted option suites (existing)
- Only client/default logical-response budgets remain: migrate provider budget tests to Client.ResponseBudget and fake clocks, retaining validation floor 1s, default 30m, absolute expiry, retries, stream idle interactions and diagnostics while deleting request-override-only cases (unit)
- Mandatory rendered-budget refusal replaces custom policy selection: retain TestDirectBudgetWiring, default TestDirectBudgetTransport assertions and conformance over-budget refusal tests; delete only custom-policy bypass assertions (integration)
- Removed options are not advertised as supported: verify README.md, docs/contract/loop-v1.md and CHANGELOG.md against the five-removal contract and one removal changelog line (existing)

## Feasibility
- none
