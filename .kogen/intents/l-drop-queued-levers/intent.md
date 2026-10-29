# Remove queued experimental levers

Slug: l-drop-queued-levers
Model: not applicable — removes optional state and branches while preserving the existing default round protocol; introduces no new state machine
Acceptance:
- .kogen/intents/l-drop-queued-levers/acceptance.feature
- features/steps/l_drop_unused.js

Remove L5 PrefixLog/EndPrefixLog, L20 ReadLedger, L23 TerminalReminders/Hooks.TerminalReminder, L26 CompactDescriptions and L27 OmitViewImage from this standalone kogen-loop tree. Almir's 29 October 2026 principle is "don't overengineer, simpler is always better": options are wrong by default. Each becomes its finding's winner, otherwise today's default, or is deleted if unused. For this scope the fixed outcomes are no prefix events, no ledger, a no-call answer ends the round, full tool descriptions and view_image always available for definition/ordinary enabled execution. Preserve all default request, result, definition and tool-output bytes. Do not bypass the normal Enabled allowlist for view_image. No finding in the supplied scope selects different default bytes.

Remove the implementation branches and associated exclusive API/support state, not just setters: provider.Client.PrefixLog, Client.EndPrefixLog and PrefixEvent; Round.ReadLedger and the ReadLedger/NewReadLedger/Continuation implementation; Round.TerminalReminders, SessionConfig.TerminalReminders, Hooks.TerminalReminder and the reminder-only event/emission; Tools.CompactDescriptions and Tools.OmitViewImage. Remove exclusively supporting code, leaving unrelated cache identity, read/image output, tool-choice support, shell timeout, safety stops and process custody behavior intact. Update any exact API-field inventory tests for the intentionally smaller API.

Delete provider/prefixlog_test.go, loop/read_ledger_test.go, tools/l_tooldesc_test.go, tools/l_image_test.go and tools/testdata/defs_compact_golden.json. Delete reminder-specific cases/helpers in loop/terminal_reminders_test.go but retain useful default-behavior coverage and shared helpers still used elsewhere. Move the full-description ShellTimeout assertions from tools/l_tooldesc_test.go into the default-definition tests in tools/defs_test.go, including stable results, no mutation of earlier definitions or another instance, and restoration at zero timeout. Preserve all other default-behavior tests unchanged except unavoidable removal of references to deleted APIs; do not weaken their assertions.

Remove current option documentation and examples from docs/contract/loop-v1.md (including stale reminder fallback advice), README.md and CHANGELOG.md wherever present. Record the removal in CHANGELOG without advertising deleted configuration as supported. Historical intents and provenance remain historical records, not current API documentation. No new option, CLI command, flag, task field or environment setting. Run every configured check, plus the README's race and conformance checks. No release, install, runtime switch, vendoring or pin update.

## Decisions
- Remove now rather than wait for queued lanes; any lane needing a lever carries its own patch. (source: request)
- Freeze today's defaults: prefix logging off, ledger absent, reminders zero, compact descriptions false, image omission false. Assert these as fixed observable behavior, not replacement configurable fields. (source: request)
- Running climbs keep their pinned frozen sha; never touch a binary a live run executes. Queued climbs re-register as uncommitted patches on the new sha. (source: request)
- No production Kogen setters exist and Kogen tests do not reference these options; do not change Kogen or cli/third_party/kogen-loop/** or cli/loop-pin.json. Changes there happen only by re-pin. (source: request)
- Shared-host safety: temporary directories only for scratch work, no synthetic CPU load, and no process-name/pattern stopping; stop only pids started by this work. (source: request)

## Source comparison
- Addressed: request L-DROP-QUEUED-LEVERS, change_type removal, source operations/build-notes/delivery/options-audit-20261029.md intent LI-3, supplies L5/L20/L23/L26/L27 scope and winners; the outcome, explicit API removals, deletion list and acceptance scenarios preserve that entire scope. The external audit is not in this checkout; no additional findings or defaults are inferred from it.
- Addressed: 29 October kogen-main rulings and simpler-is-better principle map to immediate deletion with default bytes preserved and no new options. A future yes result returns as a new Intent, not a retained switch. Commit body must state whether any finding changes default behavior; for this contract none does.
- Addressed: request experiment context is not implementation authority: live C3 AuthorityBoundary, C4 InputBudgetBytes, UT4 DisableParallelToolCalls and K-REVOD review_material are patch lanes on frozen shas; queued UT8, C5, #15, L-NUDGE and K11 run as patches on 16102c9. The request's Hold also describes UT8, C5, L-NUDGE and C3 as queued; that historical status discrepancy does not alter removal-now or authorize touching any running climb. No experiment execution, rebase, re-registration automation or outcome is part of this library delivery.
- Addressed: requested deleted tests and ShellTimeout relocation map to the exact paths above and the cleanup/default-definition acceptance gates. Existing code additionally wires reminders through SessionConfig and an API event; these exclusive surfaces must be removed to achieve no reminder option, without changing CLI commands or flags.
- Addressed: Must stay, Acceptance and Host safety map to the boundaries above, default behavior tests, all configured checks, no vendored/pin changes and no live runtime manipulation.
- Superseded: earlier optional-lever intents remain historical, but their supported current APIs and docs are replaced by this removal contract. No requested behavior is deliberately omitted.

## Tests
- Removed public levers and exclusive support APIs no longer exist: add TestQueuedLeversRemoved in conformance using public type reflection/method sets and public exported-symbol inspection for deleted named types/functions; cover every API named above (integration)
- Obsolete tests/compact fixture are deleted and maintained docs no longer offer removed settings: add TestQueuedLeverCleanup in conformance checking the exact deletion list and current documentation; allow historical removal notes but no live examples or enablement instructions (integration)
- No-call ends the round without reminder or ledger: add TestQueuedLeverDefaults in conformance through real loop.Run with a fake requester and real temporary read tool, then a no-call response; assert exact request count, EndNoCall, transcript/tool output and absence of injected ledger/reminder messages; also cover a first-response no-call through Session with no reminder events (integration)
- Full definitions and view_image availability are constants: TestQueuedLeverDefaults compares all seven instance definitions to existing defs_golden.json semantically and asserts view_image is present; retain existing successful image execution tests with the ordinary Enabled allowlist (integration)
- ShellTimeout remains caller-owned and changes only the full shell description: move full-path timeout assertions into tools/defs_test.go default-definition coverage, retaining the default golden bytes (unit)
- Existing defaults, cache behavior, safety stops, CLI and process behavior remain unchanged: run go test ./..., go test -race ./..., go test ./conformance -count=1, go vet ./..., go build -o /dev/null ./... and test -z "$(gofmt -l .)"; retain the useful pre-existing suites (existing)

## Feasibility
- none
