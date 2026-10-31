# Continue runs within the request budget

Slug: l-request-budget
Model: .kogen/intents/l-request-budget/model.qnt invariants=SafeSend seed=17 samples=100 steps=30
Acceptance:
- .kogen/intents/l-request-budget/acceptance.feature
- features/steps/l_request_budget.js

Replace the history-growth stop with automatic history condensation in the real standalone Session and provider-backed loop. Keep instructions and the active task exact, recent complete exchanges exact, and older work represented by a useful condensed summary. Do not raise the ceiling or silently clip history. No installation, publication, Kogen vendoring or pin changes.

## Decisions
- Preserve older work in a condensed summary alongside recent exact conversation and tool exchanges, and disclose condensation to the caller. (source: answer 1)
- Continue within the existing ceiling; reducing history is not completion. (source: request)

## Technical contract
Use the existing provider, role, credentials and transport for bounded summarization requests without tools. Split older history at complete exchange boundaries into fitting chunks if necessary; summarize chunks and merge summaries within budget. Include the prior summary in subsequent condensation. Preserve facts, decisions, files changed, checks and outcomes, unresolved errors and remaining work, rather than merely reporting that history existed. Treat historical instructions as data, not new authority. Keep the newest complete exchange, plus original task and subsequent user instructions verbatim. Never split calls from results or replay an incomplete tool batch.

Measure the complete rendered body with existing provider/model accounting, including instructions, definitions and cache fields. The repository limit is 524288 bytes inclusive, with output reserve 131072 tokens and smaller model-family bounds still effective; the request's description as a token budget does not authorize enlarging it. Trigger condensation before sending an oversized normal request. Every summary request must also fit. Recheck after condensation. Fit requests remain unchanged.

Each condensation attempt must consume older exact exchanges or reduce summary bytes. Bound attempts by the finite history chunks plus one merge per chunk; stop honestly on provider failure, cancellation, inability to reduce, or immutable content that cannot fit. Keep context_budget_exceeded for genuinely irreducible requests and never send those requests. No retry spin or fabricated finish. Emit caller-visible JSONL disclosure using an appropriate existing event surface or an additive v1 event, and retain the summary in session history and transcript resume.

## Source comparison
- Addressed: request L-REQUEST-BUDGET / Studio kogen-loop/request-budget-stop and answer 1 are covered by automatic summary retention, bounded sends, disclosure and CLI regression scenarios. Existing FailOverBudget and Direct refuse history growth; this contract supersedes that outcome for reducible history, not the irreducible safety guard.
- Addressed: h04 31 Oct 2026 requires shipped cmd/kogen-loop and Session hooks, not bare Hooks{}; TestRequestBudgetCLI must build and execute the binary on a fixture task and inspect provider traffic and JSONL events.
- Addressed historical reproductions: 5/8 loop cells stopped, including default review-retry r1 after 54 requests (seq 341, 2026-10-30T23:00:07Z), dry shell-bound at 73 and yielding-shell review-retry r1/r2 and shell-bound r1. Three yielding cells had passing work, review-retry r2 failed. Codex reached 177. Acceptance uses deterministic equivalent pressure at 54, 73 and 177 exchanges, not unavailable historical traces, and never infers completion from passing intermediate work.
- Superseded: README and maintained contract statements that compaction is unsupported and over-budget history is always refused must be updated with obsolete tests. Unchanged: no hidden provider fallback, unknown usage stays unknown, finish remains a claim, root containment, shell custody, tool bounds and private transcript semantics. No historical trace is claimed reproduced byte-for-byte.
- Omitted deliberately: unrelated Studio/cache/legacy historical controls in supplied testing guidance are not implementation scope; their truth and protections are unchanged.

## Tests
- Complete rendered budget is inclusive with model-family bounds and unchanged fit requests: TestRequestBudgetBoundary checks limit-1, limit, limit+1 and immutable oversized rejection without send (unit)
- Useful summary retains task, instructions and recent complete exchanges across repeated condensation and resume: TestRequestBudgetRetention verifies sent bodies and resumed history (integration)
- Summary requests fit, progress is bounded, provider failure and cancellation stop honestly without fabricated finish: TestRequestBudgetFailures (unit)
- Real CLI continues through historical-equivalent pressure, discloses condensation, keeps calling tools and ends only on model claim: TestRequestBudgetCLI builds ./cmd/kogen-loop and runs fixture tasks at 54, 73 and 177 exchanges against a local recorded-format provider, checking every body fits, old facts survive summaries, recent call/result IDs stay paired, task/instructions survive, condensation precedes continuation and no context_budget_exceeded occurs (regression)

These named builder-owned Go tests must assert observable behavior. CLI tests must execute the shipped process, not replace it with a bare engine. Use existing conformance fake-provider formats and keyless loopback support, private temporary roots and deadlines, no live or paid calls. Preserve useful tests and update superseded refusal assertions.

## Feasibility
- Quint model typechecked with installed Kogen Quint in a scratch copy (exit 0, 0.2 s); an earlier absolute scratch path was refused before execution. No new provider protocol or dependency is needed. The simple acceptance bridge only requires named tests to actually run and pass, not a generated transport observer.
