# Remove the per-call shell time limit

Slug: l-drop-shelltimeout
Model: not applicable — removing an optional input fixes execution at the existing unset behavior; no new state or lifecycle is introduced
Acceptance:
- .kogen/intents/l-drop-shelltimeout/acceptance.feature
- features/steps/l_drop_shelltimeout.js

Remove tools.Tools.ShellTimeout and its exclusive execution and description branches. Shell calls must behave exactly as today with that field unset, with no replacement limit, setting or option. Keep the instance Definition method, now returning default definitions. Preserve default request, definition and shell-result bytes, including `Commands have no time limit.` Cancellation and deadlines must continue to stop loop-owned shell process groups. Preserve the existing unbounded RunContext/CallContext behavior: do not newly forward context into sys merely because the positive-timeout branch is gone.

Delete tools/caller_shell_bound_api_test.go, the configured-limit cases in tools/defs_test.go and tools/timeout_custody_liveness_test.go, and configured-limit cases in loop/timeout_custody_liveness_test.go. Keep all default-behavior coverage, including the tools context-wrapper exact-output assertions. Update obsolete conformance expectations in conformance/climb_levers_test.go and conformance/queued_levers_test.go that require this field or its configured-description tests. Do not weaken unrelated assertions. Leave sys.Options.Timeout and its independent tests alone; this is a Tools API removal, not a sys timeout removal.

Update README.md, docs/contract/loop-v1.md and CHANGELOG.md to drop the field and configured-limit contract/examples. Preserve still-applicable process custody documentation and truthful history without advertising a removed option. No CLI/task/provider changes, installation, publishing, Kogen vendoring or pin changes are included.

## Decisions
- Fix shell behavior at the former unset value, with no per-call time limit. (source: request)
- Keep Client.ResponseBudget (10 minutes for Build and Review, loop default otherwise) and Request.Single (true only for shape workers); no other options change. Those Kogen caller policies are context, not new changes to this repository. (source: request)
- Shared-host safety: never stop processes by name or pattern, only owned pids; no synthetic CPU load; use temporary directories for runtime artifacts. Do not execute configured-timeout legacy fixtures for this removal. (source: request)

## Source comparison
- Addressed: L-DROP-SHELLTIMEOUT, change_type removal, kogen-loop, options-audit-20261029.md row L28 and the 29 Oct 2026 rulings map to the API removal and fixed-unset behavior above and the acceptance API scenario.
- Superseded: L-DROP-BUDGET-SINGLE-SHELL is replaced by this request; ResponseBudget and Single explicitly remain, as captured above. Prior caller-shell-bound and queued-lever requirements that preserve ShellTimeout are superseded only for this option.
- Addressed: requested deletion paths, configured-limit custody cases, description sentence and three maintained documents map to the cleanup paragraphs and implementation tests below. Existing conformance tests requiring ShellTimeout must change to avoid contradicting the removal.
- Addressed: byte-identical defaults and cancellation/deadline custody map to retained golden, shell and loop/sys coverage and the acceptance package checks. All configured checks remain required and unchanged.
- Omitted: no requested behavior is intentionally omitted. Historical protected Intent/step fixtures are not maintained API documentation and need not be rewritten or executed; implementation requires no protected edit.

## Tests
- Remove the public per-call field: acceptance inspects the real exported tools.Tools documentation and rejects ShellTimeout; add a focused conformance reflection assertion that the field is absent while ResponseBudget and Single remain (unit)
- Preserve default definitions byte-for-byte: retain TestGenericDefinitionsMatchTheGolden, its instance comparison and the existing golden file unchanged; remove only TestShellTimeoutChangesOnlyTheFullShellDescription (existing)
- Preserve unbounded shell output and context wrappers: retain the default portion of TestTimeoutCustodyContextCalls and all default shell tests, deleting only configured-limit cases (existing)
- Preserve cancellation/deadline process-group custody: retain all non-configured-timeout loop, sys and conformance custody tests unchanged (existing)
- Remove configured-limit support and documentation: delete exclusive API tests, update obsolete conformance inventories and documentation; run tools, loop and conformance packages via acceptance and all configured checks before delivery (integration)

## Feasibility
- none
