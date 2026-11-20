# Test retried turns and the scope of model_ms

Slug: loop-per-turn-timing-retry-and-field-scope
Model: not applicable — the change adds tests of an existing event field and keeps its behavior; there is no state to model
Acceptance:
- .kogen/intents/loop-per-turn-timing-retry-and-field-scope/acceptance.feature
- features/steps/loop-per-turn-timing-retry-and-field-scope__rules.js
- features/steps/loop-per-turn-timing-retry-and-field-scope__driver/acceptance_test.go.txt

This change proves two rules of the `model_ms` field that response events already carry (measured from the turn's request.started event to its response event on the tools clock, real time when tools.Tools.Now is nil). (a) A request the provider call retries is one turn: the retry waits are inside that turn's `model_ms` and are not split out, and the turn emits one response event. (b) Only response events carry `model_ms`: no other event, the context.condensed event in particular, has the key. The scope is one new test file, loop/turn_model_ms_rules_test.go, in the loop package, plus a fix in loop/session.go only if a check fails. The core's files, the order and number of events a round emits, every request body sent to the provider, the value and meaning of `elapsed_ms`, and the session.ended event stay as they are. No new clock seam, goroutine, timer, file or network access, no new event type, no change to api/api.go, cmd/kogen-loop/main.go, CHANGELOG.md or any documentation. Out of scope: dashboards, aggregation across turns or sessions, a session-level summary field, provider-attempt or backoff splits, and the other loops.

The new test file uses a local httptest server as the fake provider, one shared injected clock assigned to the session's tools Now function (the pattern of loop/turn_model_ms_test.go, whose modelMSClock it may reuse), and a handler that advances the clock before it answers. Nothing sleeps for real. The retry test sets the provider client's existing Sleep seam (SessionConfig.Client, provider.Client.Sleep) so no wait is real; HTTP 500 on the openai-compatible route is a retried transient status. The condensation test uses the size threshold: the request ceiling is 524288 bytes for an unprofiled model, and two turns of 20 probe calls each, each result cut to 16384 bytes, push the third request over it, so exactly one condensation happens.

## Decisions
- A request retried inside the provider call is one turn: the retry waits are inside that turn's `model_ms` and are not split out, and the turn emits one response event (source: request)
- Only response events carry `model_ms`: a turn that fails before a response emits no response event and no field, and the context.condensed event and every other event carry no such key (source: request)
- Retry is exercised with an HTTP 500 first attempt and the provider client's Sleep seam, which keeps the retry wait from sleeping for real (evidence: provider/respond.go; provider/client.go) (source: request)
- Condensation is triggered by request size, not by an option: SessionConfig has none (evidence: loop/session.go; loop/loop.go; provider/profiles.go) (source: request)
- The Build adds the one test file and changes loop/session.go only if a check fails; acceptance judges the behavior through an independent driver injected by overlay, not through the Build's test names (evidence: features/steps/loop-per-turn-timing__turns.js; loop/turn_model_ms_test.go) (source: request)

## Source comparison
- Check 1 (retried request is one turn, 100 ms failed attempt plus 200 ms answering attempt gives one response event with integer model_ms 300): addressed by scenario "A retried request is one turn".
- Check 2 (one condensation, model_ms an integer on every response event and on no other event): addressed by scenario "Only response events carry model_ms".
- A turn that fails before a response carries no response event and no field: stated as a rule; covered by the response-only key check, not a separate scenario.

## Tests
- A retried request is one turn with model_ms 300 and one response event: TestSessionRetriedRequestIsOneTurnModelMS in loop/turn_model_ms_rules_test.go (unit)
- Only response events carry model_ms, over a round with one context.condensed event: TestSessionOnlyResponseEventsCarryModelMS in loop/turn_model_ms_rules_test.go (unit)
- Existing event order, request bodies, elapsed_ms and session.ended behavior: go test ./loop (existing)
- none: no collection is processed

## Feasibility
- none
