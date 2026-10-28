# Add a lower-only input window budget

Slug: l-window
Model: not applicable — this is stateless request-size validation and default-policy wiring, not a new conversation state machine
Acceptance:
- .kogen/intents/l-window/acceptance.feature
- features/steps/l_window.js
- features/steps/l_window_driver.go

Add `InputBudgetBytes int` to `loop.Direct` and `loop.FailOverBudget`. Zero retains today's inclusive 524288-byte ceiling. Nonzero values must be in [65536, 524288]; negatives and out-of-range values return a clear configuration error before transport. Use `loop/invalid_task`, exit 2, with a message naming InputBudgetBytes and the permitted range. Validate in FailOverBudget.Prepare and in Direct's default-policy route. A nonnil Direct.Policy entirely owns policy: ignore Direct.InputBudgetBytes, including invalid values, in that route. No CLI/task setting, SessionConfig option, provider wire field, metrics collector, reset ledger, clipping, or compaction is added.

Measure the same complete rendered request as today, including instructions, tools, cache placement and parallel-call control. Effective ceiling is the minimum of the configured-or-default budget and the existing role/family bound. Preserve output reserve, unchanged input on success, typed loop/context_budget_exceeded refusal, exit code and existing message format (substituting the effective ceiling). Refusals send nothing. The provider's independent hard ceiling remains unchanged. Default request bytes and default refusal bytes must remain identical.

## Decisions
- Expose a lower-only Go library option, zero preserving 524288; custom policies remain unaffected. (source: request)
- Use 65536 bytes (64 KiB) as a conservative fixed minimum for this option. It admits research windows 393216 and 262144 while rejecting tiny unusable windows; caller instructions/tools can still exceed any selected budget and must then be refused, not clipped. This is an engineering settlement of the request's illustrative sane-minimum requirement, not a claim that arbitrary caller prefixes fit. (source: request)
- Document both fields, range, inclusive complete-body accounting, custom-policy precedence and library-only scope in docs/contract/loop-v1.md. (source: request)

## Source comparison
- Addressed: original L-WINDOW Why and What to build through the two public fields, 64 KiB minimum, default-only wiring and contract documentation above. The 28 Oct research motivation (512K vs 384K vs 256K; resets per build, total and uncached input, landed cells; reset-ledger work; provisionally started by main) is context, not authorization to add telemetry or ledger work.
- Addressed: original Must stay and Acceptance through default 524287/524288/524289 cases, lowered 204800/307200 cases, option boundaries, unchanged default bytes/refusals, and all configured checks. Executable feature cases retain these numeric examples and add adjacent boundary coverage required by docs/testing-rules.md.
- Addressed: custom-policy exemption through the explicit precedence rule and required Direct integration tests. Current loop/loop.go has no budget field and always builds FailOverBudget from client/cache/cache ID; that construction is replaced only for nil Policy.
- Addressed: README and testing rules through standard-library-only implementation, focused unit and local integration tests, retained existing tests and configured checks. No external provider fact changes; no paid/network-provider research is required.
- Addressed: Host safety by temp-only collector work, bounded child commands and no process-name killing or load generation. Protection contract has no required production-path conflict; acceptance artifacts and project configuration remain frozen except for this requested fixture correction.
- Addressed correction: audited every provider/model/effort selection in features/steps/l_window_driver.go and features/steps/l_window.js. The driver has one Role literal; JavaScript has none. Use catalog provider chatgpt and the gpt-6.1-sol/high profile selection from provider/profiles.json. provider.RequestInputBytes retains the 524288 ceiling for that family's documented bounds, so every unchanged acceptance row exercises the real default policy rather than the unknown-provider bypass in loop/loop.go.
- Conflicting and superseded: the original driver literal openai/gpt-5/default used a provider absent from provider.Catalog and bypassed FailOverBudget measurement. Only that fixture selection is superseded by chatgpt/gpt-6.1-sol/high; no product requirement, assertion, example row, Acceptance path or model declaration is superseded.
- Omitted deliberately: no release, pin/vendor update, install, CLI flag, task schema, ledger/metrics, default change or custom-policy validation. None is requested by the complete L-WINDOW contract. No requested correction is omitted; the full original prose, scenarios, assertions and declared model remain otherwise unchanged.

## Tests
- Zero preserves inclusive 524288 complete-body sizing and default byte-identical requests/refusals: acceptance boundary cases plus existing parallel-call boundary test retained; compare zero and explicit default messages and body bytes in focused tests (unit)
- Lower budgets refuse 300 KiB and pass 200 KiB at 262144, with unchanged input and no clipping: acceptance collector plus focused equality-of-input tests (unit)
- Budgets admit 65536 through 524288 inclusive, with zero special and reject negatives, 65535 and 524289 before transport with clear invalid_task range error: focused boundary tests and acceptance cases (unit)
- Configured effective ceiling cannot exceed the role/family ceiling; full rendered controls/cache/instructions/tools count and output reserve is unchanged: focused FailOverBudget tests using existing measurement fixtures (unit)
- Direct nil-policy wiring uses the configured budget, refused requests never reach transport, accepted ones retain the existing body; custom Policy ignores even invalid Direct budget and receives unchanged requests: local fake-provider Direct tests covering accepted/refused and custom-policy paths (integration)
- Maintained contract documents the public option and all existing behavior tests/checks continue to pass: inspect docs/contract/loop-v1.md and run go-format, go-test, go-vet, go-build, plus README race and conformance commands (existing)

## Feasibility
- none
