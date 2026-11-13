# Bound provider requests within one Loop stage

Slug: loop-stage-request-budget
Model: not applicable — the change is a concurrency-safe counter and validation rules checked directly by deterministic Go tests
Acceptance:
- .kogen/intents/loop-stage-request-budget/acceptance.feature
- features/steps/loop-stage-request-budget__budget.js
- features/steps/loop-stage-request-budget__driver/provider_driver.go.txt
- features/steps/loop-stage-request-budget__driver/loop_driver.go.txt
- features/steps/loop-stage-request-budget__driver/provider_binding_real.go.txt
- features/steps/loop-stage-request-budget__driver/provider_binding_stub.go.txt
- features/steps/loop-stage-request-budget__driver/loop_binding_real.go.txt
- features/steps/loop-stage-request-budget__driver/loop_binding_stub.go.txt

Add an optional, caller-owned stage budget shared by every real inference attempt of one stage, in the provider library and the direct loop requester. Without a budget, behavior is unchanged. This change adds library interface only: it does not integrate any coordinator, Shape, Build or CLI consumer, and the `kogen-loop run` task format is unchanged. The configured checks in `.kogen/project.yaml` stay unchanged and are not edited. Verification uses deterministic fake-provider tests and no paid provider probes.

## Decisions
- The library adds `provider.RequestBudget` (a struct type, pointer used, safe for concurrent use), `provider.RequestBudgetLimits{MaxRequests int; Deadline time.Time; MaxInputBytes int; MaxOutputTokens int}` (zero value of each field means no such limit), `provider.NewRequestBudget(limits, reserved int, persist func(reserved int) error) (*RequestBudget, error)`, `(*RequestBudget).Snapshot() provider.RequestBudgetSnapshot` with exactly the fields `MaxRequests, Deadline, MaxInputBytes, MaxOutputTokens, Reserved`, a new field `provider.Request.Budget *RequestBudget` and a new field `loop.Direct.Budget *provider.RequestBudget`. A nil Budget keeps today's behavior and bytes. (evidence: provider/respond.go; loop/loop.go) (source: request)
- Each actual inference dispatch attempt, including transient retries, the 401 refresh retry, routing-key retry and condensation summarization requests, reserves one request through the common `Client.Respond` attempt path immediately before the transport call; TCP liveness probes do not. Reservation is atomic under the budget's lock so concurrent callers sharing a budget cannot exceed MaxRequests. Reservation happens before credentials are sent. (evidence: provider/respond.go) (source: request)
- Checks before any reservation, in this order: parent context cancelled or past its deadline (existing behavior, nothing reserved), budget Deadline passed (`provider/request_budget_deadline`), rendered input bytes above MaxInputBytes (`provider/request_budget_input_limit`, nothing reserved), count exhausted (`provider/request_budget_exhausted`). The input limit measures the exact encoded request body bytes and is named bytes, never tokens. The budget Deadline never extends the parent's deadline. (evidence: provider/respond.go) (source: request)
- Exhaustion, deadline and input-limit errors are `*sys.Error` of class `provider`, exit 4, and are deterministic: the attempts loop and condenser stop immediately and never retry them. Existing transient retry and error classification is otherwise unchanged. (evidence: provider/respond.go; loop/condense.go) (source: request)
- Persistence: `persist` (optional, may be nil) is called with the new reserved count while the budget's lock is held, before dispatch. If it returns an error the request is refused with `provider/request_budget_persist_failed`, the count stays reserved (no refund, no reset) and nothing is sent. The library does no filesystem persistence. `NewRequestBudget(limits, reserved, persist)` restores a prior count. Snapshot contains only the five numeric/time fields, no credentials or provider data. (source: request)
- Validation, returned by NewRequestBudget as `*sys.Error` class `validation`, reason `invalid_request_budget`, before any request: negative MaxRequests, MaxInputBytes, MaxOutputTokens or reserved; MaxInputBytes above provider.InputBudgetBytes; MaxOutputTokens above provider.OutputReserveTokens; reserved above a positive MaxRequests. (evidence: provider/respond.go) (source: request)
- MaxOutputTokens is a per-response ceiling, not an aggregate token limit. It is supported only on the Messages wire (Anthropic), where the existing `max_tokens` body field is lowered to the ceiling when the ceiling is below the profile value. Responses and Chat wires carry no such field in the current code, so Render/Respond refuse a request with a MaxOutputTokens budget there with `provider/unsupported_capability` before inference, never ignoring it. (evidence: provider/messages.go; provider/wire.go) (assumption: the Messages route is the only wire with an existing output-token field; confirm the Responses and Chat wires should refuse) (source: request)
- `loop.Direct` passes its Budget on the normal request and on every condensation summarization request, so one counter spans all rounds and condensation. (evidence: loop/loop.go; loop/condense.go) (source: request)
- Docs: docs/contract/loop-v1.md documents exactly this interface, error reasons and limits, states they are library-only and that coordinator, Shape, Build, CLI and installed-runtime integration are not provided. (evidence: docs/contract/loop-v1.md) (source: request)

## Source comparison
- Addressed: positive request count across retries, condensation and rounds, concurrent safety, deadline, input-byte limit, output-token ceiling, persistence fail-closed, restore, snapshot, validation, unsupported-wire refusal, nil compatibility, parent cancellation precedence, documentation (acceptance scenarios 1-10).
- Omitted deliberately: coordinator/Shape/Build/CLI bridges, runtime promotion, aggregate token or spend enforcement, filesystem persistence, task-format changes, and any edit to `.kogen/project.yaml`. The uncommitted staging worktree codex/stage-request-budget-20261113 is prior proposal only and is not used.
- Unchanged: provider transport, credentials, existing context_budget_exceeded behavior and the existing l-request-budget condensation contract.

## Tests
- Shared count with concurrent callers: TestStageBudgetSharedAndConcurrent (unit)
- Retries consume the count: TestStageBudgetRetriesConsumeTheSameCount (unit)
- No call after expired deadline or failed reservation, no refund: TestStageBudgetNoCallRefusalsAndFailClosedPersistence (unit)
- Snapshot and restore: TestStageBudgetSnapshotRestore (unit)
- Exact rendered-input limit: TestStageBudgetInputBytesAreExact (unit)
- Output ceiling supported versus refused: TestStageBudgetOutputCeilingWireSupport (unit)
- Validation of out-of-range inputs: TestStageBudgetValidation (unit)
- Nil/unlimited compatibility and parent cancellation/deadline: TestStageBudgetCompatibilityAndParent (unit)
- Direct shares one counter across rounds: TestStageBudgetDirectSharesOneCounterAcrossRounds (integration)
- Condensation shares the count: TestStageBudgetCondensationSharesTheCount (integration)

## Feasibility
- none
