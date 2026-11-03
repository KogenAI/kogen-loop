# Disclose spent usage of a failed condensation

Slug: l-condense-failed-usage
Model: not applicable — the change reads two values the condenser already keeps (summarization requests sent and the usages received) once, when one condensation call fails, and passes them to the existing callback; no state is added, carried between requests or interleaved with other rules
Acceptance:
- .kogen/intents/l-condense-failed-usage/acceptance.feature
- features/steps/l_condense_failed_usage.js
- features/steps/l_condense_failed_usage_match.js
- features/steps/l_condense_failed_usage_driver.go

L-CONDENSE-FAILED-USAGE (kogen-loop), observability.

Problem today: history condensation (`loop/condense.go`) sends one or more summarization requests. Their usage is kept in `condenser.usages` and reported only through `Direct.Condensed` when condensation succeeds (`condense`'s `done`, loop/condense.go:494-503). If a later chunk fails, the request bound is reached, or the model returns an empty summary, `condense` returns an error and `Direct.prepare` (loop/loop.go:128-156) returns `nil, err`. The tokens already spent by the summarization requests of that attempt are reported nowhere, and nothing says how many requests ran.

After this change a failed condensation reports what it spent, through the existing condensation disclosure:
- `loop.Condensation` gains one exported field, `Failed bool`: true only for a condensation that failed. A successful condensation has `Failed` false and every other field exactly as today.
- When `Direct.Request` condenses an over-budget request and the condensation fails after at least one summarization request was sent, `Direct.Condensed` (when set) is called exactly once, before `Request` returns, with:
  - `Failed: true`;
  - `Requests`: the summarization requests sent in this condensation, counted exactly as `Requests` is counted on success (a request counts once it passed the bound and fit checks and was handed to the provider, whether or not it then succeeded);
  - `Usage`: `loop.SumUsage` of `loop.UsageOf` of every summarization response received in this condensation, the same values that make up the successful `Usage`. A response whose summary was empty is received and counts. A request that failed without a response adds nothing. When no response was received, `Usage` is unknown (`SumUsage()` of nothing: every category null, state `unknown`);
  - `BytesBefore`: the complete rendered request before condensation, and `Limit`: the effective input ceiling, as on success;
  - `CondensedExchanges`, `KeptExchanges`, `BytesAfter` and `SummaryBytes`: 0, because nothing was condensed into the conversation.
- The failure counts as "after at least one request" whatever stopped it: a provider error of a later chunk or a merge, an empty summary, a summary that could not be shortened, the bound on summarization requests (`the bound on summarization requests was reached`), a later chunk or exchange that does not fit, a request still too large after folding, a measurement error, a cancellation or a deadline.
- A failure before any summarization request was sent discloses nothing, as today. Examples: the `there is no older exchange to condense` refusal, the `the instructions, definitions, user messages and newest exchange alone exceed the ceiling` refusal, an older exchange that cannot fit a summarization request, a cancellation before the first request.
- A request that fits, and a request routed to `FailOverBudget` without condensing, send no summarization request and disclose nothing.
- The error `Request` returns is unchanged: the same error value, so the same `*sys.Error` class, reason, detail and exit. The refusal texts of `condenser.refusal` are unchanged. Example: `<owner>: complete next request N bytes exceeds LIMIT; reserve R tokens. Condensation could not reduce it: the summarization request returned no summary. The request was not sent and nothing was clipped.`

Unchanged: the successful disclosure and its values, the bound of `2*work+2` summarization requests, chunking, merging, retries and provider failure classes. The conversation request is still never sent after a failed condensation. Summarization usage still stays out of the round's `response` and `round.ended` usage totals.

Session and CLI (`loop.Session`, used by `kogen-loop run`):
- `Session.condensed` emits the failed disclosure as a `context.condensed` event with the existing fields and one more field, `"failed": true`. `n` is the request it was preparing; `requests`, `usage`, `bytes_before` and `limit` are as above; `condensed_exchanges`, `kept_exchanges`, `bytes_after` and `summary_bytes` are 0.
- It is emitted after that condensation's `request.attempt` events and before the round's error. The CLI then emits its existing `error` event (`class`, `reason`, `detail` unchanged) and `session.ended` (`status` `failed`, `exit` 1), and exits 1, as today.
- A successful condensation's `context.condensed` event is unchanged and has no `failed` field.

Documentation:
- `docs/contract/loop-v1.md` states the failed disclosure: the `Condensed` line in the `Direct` listing, the "Disclosure" bullet of "Input window budget (fixed) and condensation", and the `context.condensed` row of the events table (the `failed` field only on a failed condensation, with the zero fields).
- The `Condensed` doc comment in `loop/loop.go` and the `Condensation` doc comment in `loop/condense.go` say the same.
- README's condensation sentence may say that a failed condensation is disclosed too.
- No CHANGELOG.md entry: the commit message records the change.

Out of scope: retrying or resuming condensation, adding summarization usage to round totals, changing the refusal or provider error wording, the `error` event fields, and Kogen, its vendored copy and pin.

## Decisions
- A failed condensation reports the number of summarization requests sent and their summed usage; successful condensation, the request bound and the refusal wording stay as they are (source: request)
- The report is a disclosure of the existing condensation kind: `Direct.Condensed` with `Condensation.Failed` true, and the `context.condensed` event with `"failed": true`. The returned error is not wrapped or reworded (source: request)
- The summed usage is that of the summarization responses received: with chunk 1 summarized and chunk 2 failing, it equals the chunk-1 usage plus any usage the failed request returned (none when it returned no response) (source: request)
- A history that fits sends no summarization request and discloses nothing (source: request)

## Source comparison
- Addressed, Problem "usage ... reported only through `Direct.Condensed` when condensation succeeds": a failure after at least one summarization request now calls `Direct.Condensed` once with `Failed: true`, `Requests` and `Usage`. The CLI emits it as `context.condensed` with `"failed": true`.
- Addressed, "the refusal does not say how many requests ran": the failed disclosure carries `Requests` (`requests` in the event). The refusal text itself stays unchanged, as the Need requires.
- Addressed, Need "the typed refusal (or a disclosure event of the existing condensation kind) carries the number of summarization requests sent and their summed usage": the disclosure route was chosen, because it reaches both library callers (`Direct.Condensed`) and CLI callers (`context.condensed`) without changing the returned error's identity, which consumers inspect through `sys.Error` fields.
- Addressed, Synthetic acceptance 1 (chunk 1 succeeds, chunk 2 errors):
  - Scenario `Chunk 1 is summarized, chunk 2 fails: the failure discloses 2 requests and the chunk-1 usage`.
  - The loopback provider answers chunk 1 with usage input 100, cached 10, output 20, reasoning 5 and chunk 2 with HTTP 400.
  - Expected: `Requests` 2, `Usage` equal to the chunk-1 usage, the unchanged `provider/refused` error `ChatGPT refused the request: 400 fixture failure`, and no conversation request.
- Addressed, Synthetic acceptance 2 (empty summary): scenario `An empty summary discloses 1 request and its usage, and the refusal wording is unchanged`. Expected: `Requests` 1, the empty response's usage, and the unchanged `loop/context_budget_exceeded` detail, matched by its full wording.
- Addressed, Synthetic acceptance 3 (success): scenario `A successful condensation is disclosed as before and is not marked failed`.
  - The values are the control observed on the unchanged tree: `Requests` 2, `Usage` 300/40/60/12, `CondensedExchanges` 7, `KeptExchanges` 1, `BytesBefore` 721899, `BytesAfter` 90827, `Limit` 524288, `SummaryBytes` 11.
  - The one addition is `Failed` false.
- Addressed, Synthetic acceptance 4 (history that fits): scenario `A history that fits sends no summarization request and discloses nothing`.
- Addressed, CLI boundary: scenario `The CLI emits a failed context.condensed event before the unchanged refusal` (empty summary at request 6) and the control `The CLI discloses a successful condensation as before, without a failed field`.
- Evidence confirmed at HEAD 70f3ab5:
  - loop/condense.go:339-381: `send` counts `c.sent` before `Respond`, appends usage at :362, returns `"", err` on a provider failure and `c.refusal(...)` on empty text at :379.
  - loop/loop.go:150-153: `prepare` returns `nil, err` from `condense`.
  - loop/condense.go:494-503: the usage is reported only on success, via `c.d.Condensed`.
  - loop/session.go:253-260: `Session.condensed` emits `context.condensed`.
- Replaced: the existing test `a provider failure stops without sending the conversation` (loop/request_budget_test.go) treats any disclosure as an error. Its first summarization request fails after being sent, so it now expects exactly one disclosure with `Failed` true, `Requests` 1 and unknown usage.

## Tests
- A condensation that fails after sending summarization requests calls `Direct.Condensed` once with `Failed` true, the requests sent, the summed usage of the responses received and zero condensed fields, and returns the unchanged error: acceptance scenarios `Chunk 1 is summarized, chunk 2 fails: ...` and `An empty summary discloses 1 request and its usage, ...`. Also new cases in `TestRequestBudgetFailures` (loop/request_budget_test.go) over the local `olProvider`: a chunk-2 provider failure (2 requests, chunk-1 usage) and an empty summary (1 request, its usage), with responses that carry usage (integration)
- A first summarization request that fails without a response discloses 1 request with unknown usage: update `a provider failure stops without sending the conversation` in `TestRequestBudgetFailures` to expect that one disclosure instead of none (integration)
- A failure before any summarization request discloses nothing: the existing `immutable content that cannot fit is refused without any request` and `an exchange that cannot fit a summary request is refused` cases keep passing, the first with its existing `Condensed` callback that fails on any call (existing)
- A successful condensation is disclosed as before, with `Failed` false: acceptance scenario `A successful condensation is disclosed as before and is not marked failed`, plus the existing `TestRequestBudgetBoundary` and `TestRequestBudgetFailures` success cases (existing)
- A request that fits sends no summarization request and discloses nothing: acceptance scenario `A history that fits sends no summarization request and discloses nothing`, plus the existing `limit-1`/`limit+0` boundary cases (existing)
- The CLI emits a failed condensation as `context.condensed` with `"failed": true` before the unchanged `error` and `session.ended`, and keeps the successful event without `failed`: acceptance scenarios `The CLI emits a failed context.condensed event before the unchanged refusal` and `The CLI discloses a successful condensation as before, without a failed field`, plus the existing `TestRequestBudgetCLI` (scenario)
- The request bound, refusal texts and the rest of condensation are unchanged: the existing `TestRequestBudget*` tests in `loop` and `conformance` keep passing under `go test -race ./...` (existing)

## Feasibility
- Repository inspection:
  - `condenser.sent` and `condenser.usages` already hold the count and the usages at every failure point.
  - `Direct.prepare` is the single caller of `condense`, so the failed disclosure can be made there or inside `condense`.
  - `Session.condensed` is the single mapping to `context.condensed`.
  - `Direct`'s field list is pinned by `tool_overlap_compat_test.go`, but no field is added to `Direct`. `Condensation` is not pinned by `contract/` or any test.
  - No external protocol or library is involved, so no documentation lookup was needed.
- Scratch checks, outside the checkout (a `git archive` copy of HEAD):
  - On the unchanged tree the driver observed the expected failures: 2 summarization requests and a `provider/refused` error with no disclosure; 1 request and the `loop/context_budget_exceeded` refusal with no disclosure; the successful control values listed above; and 0 summarization requests for the history that fits.
  - The CLI fixture (5 reads with 120000-byte arguments) condenses at request 6 with one summarization request. On failure it emits only `error` and `session.ended`.
  - The byte counts were identical across repeated runs.
  - The acceptance passes 2 of 6 scenarios on the unchanged tree: the two controls, `A history that fits ...` and the CLI success control. The other 4 fail only on the missing disclosure (`expected 1 entries, got 0`, `Failed: expected false, got absent`, `expected 3 entries, got 2`), after their fake providers reached the intended chunk, empty-summary and success paths.
  - A reference implementation passed all 6 scenarios. It added `Failed`, a disclosure in `prepare` when `condense` fails with `c.sent > 0`, and `failed: true` in `Session.condensed`. With it, `go build ./...` was clean and only the expected existing case `a provider failure stops without sending the conversation` failed.
  - The good observations in the matcher's controls were recorded from that reference implementation.
- evidence: {"id":"library-observer","kind":"observer","inputs":["features/steps/l_condense_failed_usage_match.js"],"observers":["features/steps/l_condense_failed_usage_match.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/l_condense_failed_usage_match.js --control library good","exit":0,"output":"match\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/l_condense_failed_usage_match.js --control library bad","exit":1,"output":"mismatch at $.disclosures[0].Usage.input: expected 100, got null\n"}]}
- evidence: {"id":"cli-observer","kind":"observer","inputs":["features/steps/l_condense_failed_usage_match.js"],"observers":["features/steps/l_condense_failed_usage_match.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/l_condense_failed_usage_match.js --control cli good","exit":0,"output":"match\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/l_condense_failed_usage_match.js --control cli bad","exit":1,"output":"mismatch at $.events[0].failed: expected true, got absent\n"}]}
