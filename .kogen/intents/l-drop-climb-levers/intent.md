# Remove climb option levers

Slug: l-drop-climb-levers
Model: not applicable — removal of configuration preserves existing stateless request transformations and runtime state machines
Acceptance:
- .kogen/intents/l-drop-climb-levers/acceptance.feature
- features/steps/l_drop_unused.js

Remove L10 DisableParallelToolCalls from provider.Request, loop.Request and loop.Round; L12 provider.Request.AuthorityBoundary; L17 InputBudgetBytes overrides on loop.Direct and loop.FailOverBudget; L29/L30 tools.Tools.ResultBound/ResultHead; and L31/L32 tools.Documentation.ResultBound/BodyBound. Remove their branches, validation, forwarding and unused helpers. Retain fixed provider/tools input-budget constants and measurement reporting: these are not configurable levers. Hardcode the current behavior: 524288-byte maximum window (retaining smaller model-family bounds), 16384/4096 result cut, 16384-byte documentation result and 8388608-byte response prefix, provider-default parallel calls, and three default cache breakpoints. No supplied finding names a different winner; do not invent one. No new option, CLI command, flag or task-schema change.

Delete provider/parallel_tool_calls_test.go, provider/authority_breakpoint_test.go, loop/input_budget_test.go, loop/l_cut_test.go, tools/l_cut_test.go, tools/l_docbound_test.go and features/steps/l_window_driver.go. Preserve tools/testdata/cut_golden.json and default-cut cases. Retain ToolChoice coverage in provider/tool_choice_helpers_test.go and loop/parallel_tool_calls_test.go without the removed flag. Remove option-only cases elsewhere, including authority-only breakpoint tests; relocate shared baseline fixtures/helpers before deleting their original files. Adjust reflective API lists and previous removal tests that explicitly require the now-removed overrides. Adapt documentation-range tests to fixed bounds while retaining range behavior coverage. Remove obsolete L-WINDOW step bindings that invoke the deleted driver. Do not change unrelated defaults or weaken useful default behavior assertions.

Update docs/contract/loop-v1.md (or docs/configuration.md if present), README.md and CHANGELOG.md so removed options are not advertised as supported. Historical provenance need not be rewritten. State in the commit body that defaults remain unchanged; any actual finding-driven deviation would require a supplied winning finding, not an implementation guess.

## Decisions
- Apply Almir's 29 Oct 2026 principle, "don't overengineer, simpler is always better": options are wrong by default and a finding becomes the only behavior. An option without a finding is frozen at today's value and deleted. (source: request)
- Remove now without mutating any live executable, running climb or frozen sha. Queued climbs re-register as uncommitted patches on the new sha. (source: request)
- No global install, runtime switch, Kogen vendoring or pin update is included. (source: request)

## Source comparison
- Addressed: request L-DROP-CLIMB-LEVERS, audit operations/build-notes/delivery/options-audit-20261029.md LI-4, options L10 (three sites), L12, L17 and L29–L32 map to the complete removal inventory above and the first acceptance scenario. The audit is not present in this checkout; no undocumented winner is assumed. The request's explicit fallback values govern.
- Addressed: C1, C3, C4, UT4 and L9-adjacent #15 context does not supply a different winning value. Live C3 AuthorityBoundary, C4 InputBudgetBytes, UT4 DisableParallelToolCalls and K-REVOD review_material remain patch lanes on frozen shas. Queued UT8, C5, #15, L-NUDGE and K11 run as patches on 16102c9; a yes result returns as a new Intent. No experiment execution or re-registration tooling is added here.
- Addressed as external prerequisite, not silently omitted: Kogen setters K1, K2, K3, K4, K6, K7 in cli/internal/research (KI-3) must be removed first in Kogen. L10 has no setter. That tree is absent from this standalone repository; this delivery cannot claim to have removed those setters. Do not add that tree or edit cli/third_party/kogen-loop/** or cli/loop-pin.json; those change only by re-pin.
- Addressed: request deletion list, surviving golden/default tests, ToolChoice preservation, constant assertions, documentation and all configured checks are specified above and below. Existing tests demanding configurable overrides are superseded only for those removed APIs; default behavior remains authoritative.
- Addressed: shared-host safety applies to every check: temporary directories only for generated artifacts, no synthetic CPU load, never stop processes by name/pattern, only terminate pids started by the test. No paid provider calls are needed.

## Tests
- Removed public configuration fields and option-only files no longer exist: add TestClimbLeversRemoved in conformance, checking the exact inventory above through public type reflection and file absence; preserve measurement fields and fixed constants (integration)
- Fixed values preserve default behavior: add TestClimbLeverConstants in conformance asserting 524288, 16384/4096, 16384/8388608 and three cache breakpoints through public measurement/cut/documentation/provider interfaces with local recorded/fake transport; include a real loop round delivering a cut tool result and verify default provider parallel wire fields and ToolChoice remain unchanged (integration)
- Default transformations and protocol behavior remain byte-identical: keep default cut goldens and existing provider baseline bodies, default documentation fitting and range coverage, updating only removed-option cases and helper dependencies; run go test ./... plus configured go-format, go-vet and go-build checks (existing)

## Feasibility
- none
