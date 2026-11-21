# Bound the header wait on Messages and Responses

Slug: loop-header-wait-on-messages-responses
Model: not applicable — the change is a per-attempt timer limit with no state machine worth modelling
Acceptance:
- .kogen/intents/loop-header-wait-on-messages-responses/acceptance.feature
- features/steps/loop-header-wait-on-messages-responses__steps.js
- features/steps/loop-header-wait-on-messages-responses__driver/driver_test.go.txt

On the Responses route (ChatGPT, SuperGrok) and the Messages route (Anthropic) the wait for the response headers is bounded by the same `Client.HeaderTimeout` as Chat Completions (default `DefaultHeaderTimeout`, 120 s; a non-positive value means the default). A header wait that expires ends the attempt as a transient failure with the detail `no response headers within <N> s` (N follows the configured timeout). When the headers arrive in time, the first-progress limit (`no first byte within 45 s`, 90 s for ChatGPT) starts counting at the headers instead of at dispatch; the 180 s idle limit after the first progress is unchanged. A body read whole (any HTTP error body) keeps the headers as first progress. Retry counts, backoff, the absolute budget, the visible output limit and request bytes are unchanged. The old rule (first-progress clock from dispatch on streams) is removed, not kept beside the new one.

Scope: provider/idle.go, provider/respond.go (the Responses and Messages exchanges only), docs/contract/loop-v1.md (only the sentence about the first-progress clock for streams and the sentence listing the expired-attempt details) and one new model-free test file `provider/header_wait_responses_test.go`. Out of scope: the Chat Completions exchange, retry policy, the output limit, credentials, profiles and every other doc.

The Build adds `provider/header_wait_responses_test.go` with four model-free tests (one per number of the acceptance: Messages 60 s, Responses 100 s, never-sent headers with default and configured timeout, first progress counted from the headers), sharing one fixture-server helper, on the injected fake clock `Client.Now`, no real sleeping. The acceptance runs its own driver tests, so the Build chooses its names and helpers freely, but no identifier it adds may start with `hwa` or `TestHeaderWaitDriver`. The Build establishes by reading the existing tests which of the protected cases they already cover (Messages headers at once then silence ends at 45 s; ChatGPT at 90 s; an HTTP error body read whole with the headers as first progress; the Chat exchange) and adds no tests or assertions for them.

## Decisions
- The header wait of every wire is bounded by `Client.HeaderTimeout`, default `DefaultHeaderTimeout` (120 s), non-positive meaning the default; the existing option is reused and no new setting is added. (evidence: provider/idle.go; provider/client.go) (source: request)
- A Responses or Messages attempt starts with the header timeout as its limit and the detail `no response headers within <N> s`; when the headers arrive within the limit it restarts its clock at the headers with the first-progress limit (45 s, 90 s for ChatGPT); Chat keeps its own flow. (evidence: provider/idle.go; provider/respond.go) (source: request)
- A silence before the headers never names the first-byte or idle limit. (evidence: provider/idle.go) (source: request)
- A body read whole keeps the headers as first progress; the 180 s idle limit and the 3-attempt policy are unchanged. (evidence: provider/respond.go; docs/contract/loop-v1.md) (source: request)
- docs/contract/loop-v1.md: the silence-limit sentence says the first-progress clock of streams starts at the response headers and that the header wait of every route is limited by `Client.HeaderTimeout`; the expired-attempt sentence lists `no response headers within 120 s` for every route, not only Chat Completions. (evidence: docs/contract/loop-v1.md) (source: request)

## Source comparison
- Addressed: Messages headers held 60 s then normal answer succeeds first attempt (1); Responses (ChatGPT) held 100 s succeeds (2); never-sent headers end at the configured timeout with `no response headers within 120 s` and 30 s with `no response headers within 30 s`, never naming first byte or idle (3); headers at 100 s and first event 40 s later succeeds, headers then silence ends 45 s after the headers with `no first byte within 45 s` (4).
- Open limit beside those guarantees: a host silent longer than the header timeout still ends the attempt, and after 3 attempts the call.
- Constraints protected by existing tests, not acceptance: see the paragraph above.

## Tests
- Messages header delay of 60 s then a normal answer succeeds on the first attempt: Messages60s driver test (integration)
- Responses (ChatGPT) header delay of 100 s then a normal answer succeeds on the first attempt: Responses100s driver test (integration)
- Never-sent headers end at the default and the configured header timeout with the header detail: NeverHeaders and ConfiguredTimeout driver tests (integration)
- First-progress clock starts at the headers: FirstEventAfterHeaders and SilenceAfterHeaders driver tests (integration)

## Feasibility
- none
