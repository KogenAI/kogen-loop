# Bound Chat response-header wait separately

Slug: loop-header-delay-and-plain-json-fixtures
Model: not applicable — the change is a per-attempt timer limit and a reader of one HTTP exchange, with no state machine worth modelling
Acceptance:
- .kogen/intents/loop-header-delay-and-plain-json-fixtures/acceptance.feature
- features/steps/loop-header-delay-and-plain-json-fixtures__steps.js
- features/steps/loop-header-delay-and-plain-json-fixtures__driver/driver_test.go.txt

A provider that stays silent for 53 to 60 s before it sends any response header failed every Chat Completions attempt in production, because the per-attempt watchdog (provider/idle.go) starts a 45 s first-byte limit at dispatch, and the only fixture (provider/idle_stream_test.go) sends the headers at once and stalls afterwards. For Chat Completions (opencode-go and openai-compatible, provider/chat_stream.go, provider/respond.go exchangeChat) the wait for the response headers becomes its own limit: one named, configurable header timeout of at least 120 s by default, separate from the 30 s dial timeout in provider/client.go. The idle watchdog starts counting at the headers, so a header delay never spends the idle limit. Scope: provider/idle.go, provider/client.go, provider/chat_stream.go and new model-free test files in provider/. Out of scope: retry policy, other providers' request formats and the 180 s streaming idle limit once data flows.

The Build also adds the model-free tests named below as new files in provider/, each running on the package's fake clock (Client.Now) against a local httptest fixture server, without real sleeping. The acceptance runs its own driver tests, not those, so the Build chooses their helpers freely; a test name the Build adds must not start with TestHeaderDriver.

## Decisions
- The wait for the response headers of a Chat Completions request is limited by one named, configurable header timeout whose default is at least 120 s. It is separate from the 30 s dial timeout and from the idle limit. The Build chooses the identifiers of the option and of its default (a Client option and a named default value); the acceptance does not assert them. (constraint: one header timeout, no second knob) (evidence: provider/client.go; provider/idle.go; provider/respond.go) (source: request)
- The idle watchdog starts counting when the headers arrive: a Chat attempt's watch begins with the header timeout as its limit, and the observation of the headers switches it to the 180 s idle limit and restarts its clock, so no header delay within the header timeout is charged to the idle limit. (constraint: the 180 s idle limit is unchanged) (evidence: provider/idle.go; provider/respond.go) (source: request)
- A Chat attempt that gets no headers within the header timeout ends as a transient failure as today, and its error text says the wait was for response headers and never uses the stream idle wording. The exact wording is not fixed. Retry policy is unchanged. (evidence: provider/idle.go; provider/stream_idle_test.go) (source: request)
- A host that answers a `stream: true` request with a plain JSON body (Content-Type application/json) is read as a complete answer, and a stream that carries a tool call, followed by a second request carrying the tool result, completes through the streaming path. The Build establishes by reading provider/chat_stream.go whether each already holds; both stay required of the finished change. (evidence: provider/chat_stream.go; provider/respond.go) (assumption: the current reader already satisfies both; the Build confirms it and changes the code only where it does not) (source: request)
- Release evidence: the Build adds model-free integration tests named TestStreamDelayedHeaders60s, TestStreamHeaderTimeoutNamesHeaders, TestIdleClockStartsAfterHeaders, TestStreamRequestPlainJSONAnswer and TestStreamToolCallRoundTrip in new files in provider/, and names in its report the test that fails on main before the change and passes after it. (evidence: provider/idle_stream_test.go; provider/chat_stream.go) (source: request)

## Source comparison
- Addressed: header delay of 60 s on a fake clock then a normal answer (scenario 1); no headers beyond the header timeout fails naming the header wait (scenario 2); headers at 100 s and first chunk 150 s later is not cut at 120 s in total (scenario 3); plain JSON answer to a stream request (scenario 4); streamed tool call then a second request with the tool result (scenario 5).
- Open limit beside the 60 s guarantee: a host silent before the headers for longer than the header timeout still ends the attempt with the header-wait error.
- Omitted deliberately: retry policy, other providers, the 180 s idle limit.

## Tests
- A header delay of 60 s then a normal stream succeeds: TestStreamDelayedHeaders60s (integration)
- No headers beyond the header timeout fails naming the header wait, not idle: TestStreamHeaderTimeoutNamesHeaders (integration)
- Headers at 100 s, first chunk 150 s later, no cut at 120 s total: TestIdleClockStartsAfterHeaders (integration)
- A plain JSON body answering a stream request is read as a complete answer: TestStreamRequestPlainJSONAnswer (integration)
- A streamed tool call then a second request with the result both complete: TestStreamToolCallRoundTrip (integration)
- Existing idle and Chat stream tests that expect the 45 s first-byte text for Chat are updated to the header-wait behavior: existing provider idle tests (existing)

## Feasibility
- none
