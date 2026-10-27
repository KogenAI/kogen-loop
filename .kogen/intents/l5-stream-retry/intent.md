# Retry transient provider stream faults

Slug: l5-stream-retry
Model: not applicable — the change is a classification of one stream event plus reuse of the existing bounded retry loop; there is no new state machine.
Acceptance:
- .kogen/intents/l5-stream-retry/acceptance.feature
- features/steps/l5_stream_retry.js
- features/steps/l5_stream_retry_test.go.txt

In the Anthropic route of `provider/`, an SSE `error` event whose `error.type` is `overloaded_error`, `api_error` or `rate_limit_error` is a transient fault, not an unreadable answer. `parseMessages` returns `resTransient` for it, and the existing `attempts` loop retries it: at most 3 requests, waits of 2 s then 8 s, all inside the call's absolute budget (`ResponseBudget` / `Request.Budget`). The transient result carries the diagnostics `{"anthropic_transient":"sse_error","error_type":"<type>"}` (only the allowlisted type from `errorTypes`, never message text), which appear as `provider_failure` on that attempt's usage record and, after exhaustion, on the `provider/unavailable` error's `ProviderFailure`. Each retry is a separate attempt record seen by the Observer.

Every other error type (including `invalid_request_error`, `authentication_error`, unknown, non-string or missing types) and every malformed event stays `resInvalid` with today's diagnostics (`{"anthropic_invalid":"sse_error","error_type":...}`, `error_type` `unknown` outside the allowlist), one request, `provider/invalid_response`. Definite refusals (context too long), 401 and the other HTTP failures behave as today. A stream cut mid-body (connection closed, no `message_stop`) is already transient and retried (observed by a fake-server check); keep it so. A response that was returned (including one with tool calls) is never replayed. Cancellation (session interrupt) or an expired budget during the wait ends the call with the existing interrupt/expiry error. No new timeout, knob or loop; ChatGPT, SuperGrok, compatible providers and `Request.Single` are unchanged. Public types and `Response` fields keep their shape. Only files under `provider/` change; `sys/`, `tools/` and `loop/session.go` are untouched.

Existing provider tests that assert the old behaviour for an `overloaded_error` stream event must be updated, and only those: `provider/messages_test.go` (the "error event" `parseMessages` assertion, now `resTransient`) and the `error` case in `provider/anthropic_invalid_diagnostics_test.go` (move it to a non-retried type such as `invalid_request_error`, or assert the new transient diagnostics). The `conformance/` Go tests need no edits.

## Decisions
- `rate_limit_error` is transient together with `overloaded_error` and `api_error` (source: request)
- Retry bounds are the existing 3 attempts, 2 s then 8 s, inside the absolute budget; no new setting (source: request)
- Transient stream-error diagnostics use the key `anthropic_transient` (sibling of `anthropic_invalid`) with `error_type` (source: request)

## Source comparison
- SSE `error` event types overloaded_error/api_error/rate_limit_error transient: addressed in `messageState.apply`/`parseMessages` (request item 1).
- Aborted stream retried: already true for EOF and reset (probe: cut and exhausts cases pass on the unchanged tree); covered by acceptance (request item 2).
- Never replay a returned response, no retry after cancellation or spent budget: covered by tool-call, cancellation and budget cases (request item 3).
- Bounds and per-attempt visibility: covered by exhaustion and record assertions (request item 4).
- Old assertions for overloaded_error as invalid: superseded in the two provider tests named above; the 059 acceptance feature of the earlier Intent lists `overloaded`/`api` as invalid and is superseded for those two types only.
- Out of scope: timeout defaults, retry knobs, loop/session, tools, resume, cache, other providers.

## Tests
- Overloaded_error, api_error and rate_limit_error stream events retry once and recover with two recorded attempts, first failed with transient diagnostics: `TestL5StreamRetry/recovers_*` in the acceptance fixture, and update the "error event" assertion in `provider/messages_test.go` (unit)
- Three transient faults end unavailable with three requests and waits 2 s, 8 s: `TestL5StreamRetry/exhausts_after_three` (integration)
- A cut stream is retried and exhausts after three: `TestL5StreamRetry/cut_stream_recovers` and `cut_stream_exhausts` (integration)
- Other error types and malformed events are not retried and keep their diagnostics: `TestL5StreamRetry/not_retried_*`, and update the `error` case of `provider/anthropic_invalid_diagnostics_test.go` (unit)
- Definite refusals and 401 are not retried: `TestL5StreamRetry/refusal_and_401_not_retried` (integration)
- Interrupt or expired budget during the wait stops the retry: `TestL5StreamRetry/cancelled_during_wait` and `budget_spent_during_wait` (integration)
- A returned tool-call response is never re-requested: `TestL5StreamRetry/tool_call_response_returned_once` (integration)
- ChatGPT single-attempt behavior is unchanged: `TestSingleAttemptDoesNotRetry` and `TestL5StreamRetry/single_attempt_provider_unchanged` (existing)
- The conformance suite and the rest of the provider suite stay green: `go test ./conformance/...` and `go test ./...` (existing)

## Feasibility
- The fixture compiles in the provider package through a go test overlay; on the unchanged tree the cut-stream, non-retry, refusal, tool-call and single cases pass, and the overloaded/api/rate-limit recovery, exhaustion, cancellation and budget cases fail as expected. (probe 1: exit 1, 1.3 s)
