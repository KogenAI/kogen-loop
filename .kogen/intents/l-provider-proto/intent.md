# Preserve Responses outcomes and diagnostics

Slug: l-provider-proto
Model: not applicable — these fixes validate one effective output and preserve reported fields; they add no lifecycle or retry state
Acceptance:
- .kogen/intents/l-provider-proto/acceptance.feature
- features/steps/l_provider_proto.js

Fix F1–F4 from the supplied L-PROVIDER-PROTO audit of b97ee73 (29 October 2026). Work only in standalone kogen-loop, not Kogen's executor, vendored copy or pin. Add the named Go regression tests required by acceptance as ordinary implementation-owned tests. The acceptance bridge invokes them, requires each named test to actually run and pass, and must not be satisfied by a missing or skipped test. Reuse existing provider fake/event helpers and conformance process fixtures. No paid requests, credentials, new option, dependency or production mocking abstraction.

## Decisions
- Preserve refusal parts in the public claim, in content order with output_text, joining parts with the existing newline convention. A refusal-only claim is `I cannot help with that request.` rather than empty. Keep a valid provider completion as a no_call ending, not a transport failure; its explicit refusal explanation reports the refusal without a new ending enum or exit-code change. Mixed text/refusal must retain both parts. (source: request)
- Validate uniqueness of function_call call_id across the entire effective Responses output before exposing any calls. Reject the whole malformed batch using existing invalid-response retry policy; never choose one duplicate or execute either. Cover both streamed done items and authoritative nonempty terminal output. Distinct IDs remain valid. (source: request)
- Normalize terminal failed/incomplete usage and identity independently of output acceptance, using existing nullable usage consistency rules. Retain provider_response_id and known categories in failed attempt records. Missing cut-stream accounting stays unknown. Failure precedence and unexecutable unfinished tools remain unchanged. Retain the incomplete reason as an allowlisted structured diagnostic, including max_output_tokens, without inventing a provider code. (source: request)
- Attach existing allowlisted diagnostics for definite resError outcomes, including context-length, flat/nested error, incomplete and HTTP failures. Retain existing bounded validation evidence for discarded invalid completions, including recovered retries. Do not retain raw messages, arguments, event bodies or secrets. (source: request)
- Preserve normal-response and distinct-ID tool behavior byte-identically, including replay, requests, cache, usage and tool output; no new option or retry. Use only temporary test directories and processes started by the tests; never kill by name/pattern, never generate synthetic CPU load. (source: request)

## Source comparison
- Addressed: request F1 and audit refusal-only/mixed examples by Decisions 1 and TestProviderProtoRefusalClaim. The audit explicitly permits preserving refusal text instead of adding an outcome; exit 0 continues to mean round ended, not verified work.
- Addressed: request F2 and audit shell duplicate example by Decision 2 and TestProviderProtoDuplicateCalls. The malformed input is two calls at indexes 0/1 with call_id call_1, name shell, arguments {"command":"printf x >> counter.txt"}; assert no counter mutation, including conflicting duplicate arguments. Distinct IDs are the valid counterexample.
- Addressed: F3's resp_limit terminal incomplete with input 1000, cached 200, output 500, reasoning 400 and reason max_output_tokens, plus terminal failed and cut-stream counterexample, by Decision 3 and TestProviderProtoTerminalAccounting. This supersedes the old blanket unknown-on-failure accounting policy only where the terminal envelope supplies accounting. Retain ordinary failure classification; do not make output-limit failures successful.
- Addressed: F4's context_length_exceeded/request_error/context limit and recovered invalid arguments [] by Decision 4 and TestProviderProtoAttemptDiagnostics. Existing final typed errors remain correct; attempts must now retain safe evidence too.
- Addressed: all configured checks and explicit -race requirement through compatibility scenario; audit checked-sound framing, completion precedence, replay, successful accounting and bounded retries remain protected by existing tests. The supplied audit is static evidence, not a production incident or executed test result.
- Omitted deliberately: changes to kogen/cli/build/executor_native.go or vendor pins are outside the requested standalone repository. Historical paths and 16:20Z snapshot comparisons are provenance, not local files to modify. No supplied requested fix is otherwise omitted.
- Documentation: Shape search for OpenAI Responses streaming references returned retrieved sources including platform.openai.com; fetch https://platform.openai.com/docs/api-reference/responses-streaming/response/incomplete returned unsupported with no body. No official body was verified; the supplied explicit response fixtures and local interfaces define this correction, not an invented external compatibility claim.

## Tests
- Refusal-only and mixed completion preserve explanation through public results: add TestProviderProtoRefusalClaim in conformance using the actual built CLI and local scripted Responses server, asserting round.ended claim/no_call and normal process termination (regression)
- Duplicate call identities reject the whole effective batch before side effects: add TestProviderProtoDuplicateCalls in conformance through the real loop/provider route, covering done items, final output, conflicting duplicates and distinct-ID control (regression)
- Failed/incomplete terminal accounting survives independently of output validity: add TestProviderProtoTerminalAccounting in provider using the existing fake transport and attempt observer, with exact supplied counts/ID, failed envelope, absent usage and unfinished-tool rejection (regression)
- Definite failure and discarded validation diagnostics survive attempts without raw payloads: add TestProviderProtoAttemptDiagnostics in provider covering context_length_exceeded, flat/nested errors, incomplete, HTTP failure and recovered [] validation; include pending items, index gaps and invalid envelope as existing bounded validation categories (regression)
- Normal byte compatibility and configured checks including race remain green: run unchanged full suite, race suite, formatting, vet and build (existing)

## Feasibility
- Local probe confirmed go test -json exposes named run/pass events for TestDiagnosticsOmitIllTypedFields in ./provider (exit 0, 7.0 s). The bridge only checks named Go test execution, not scripted transport or lifecycle observations; implementation-owned regression tests supply the actual behavior assertions.
