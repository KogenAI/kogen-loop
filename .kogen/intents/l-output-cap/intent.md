# End streamed attempts with runaway visible output

Slug: l-output-cap
Model: not applicable — one per-attempt byte count compared with a fixed bound; the attempt and retry state machine is reused unchanged
Acceptance:
- .kogen/intents/l-output-cap/acceptance.feature
- features/steps/l_output_cap.js

Fix L-OUTPUT-CAP (change_type: fix; Studio kogen-loop issue 7c252f2c-7a58-4a27-8740-c5a238ce39d1). Sometimes one streamed response keeps sending visible output until the provider's 128,000-token output cap. The first-byte and idle watchdogs never fire because tokens keep arriving. Today the attempt reads everything and the run then fails on the provider's cap ending. In a scratch run of the unchanged tree against a fake ChatGPT Responses stream, the run ended with exit 1 and `provider/refused` `ChatGPT refused the request: stream %{"reason" => "max_output_tokens"}` after 567039 stream bytes. On Anthropic Messages it ended with `provider/invalid_response` `malformed Anthropic completion`. Research also saw the 30-minute response wait expire once. This Intent ends such a streamed attempt early, based only on what the stream shows. The attempt then fails like any other failed attempt, and the existing retry policy decides whether the run continues or stops. Adds no timeout, no retry, no limit increase and no option.

Rule (new, fixed, not an option; provider package, every caller and the CLI):

- **Visible output limit:** 131072 bytes (128 KiB) of visible output per transport attempt on the streaming wires: Responses (ChatGPT, SuperGrok) and Messages (Anthropic). Exactly 131072 bytes is allowed. 131073 or more ends the attempt. The count starts at zero for every attempt, retries included.
- **What counts:** the UTF-8 byte length of the decoded JSON string in these completed SSE data events:
  - Responses: the `delta` of `response.output_text.delta`, `response.refusal.delta` and `response.function_call_arguments.delta`.
  - Messages: `content_block_delta` events whose `delta.type` is `text_delta` (count `delta.text`) or `input_json_delta` (count `delta.partial_json`).
  - A missing or non-string delta counts 0.
- **What does not count:**
  - reasoning: Responses `response.reasoning_text.delta` and `response.reasoning_summary_text.delta`; Messages `thinking_delta` and `signature_delta`;
  - every `*.done` event, `response.output_item.done` items and the output of `response.completed`, because they repeat text already counted;
  - keep-alives, comments, framing, any other event type, and an unfinished event.
- **When the attempt ends:** the event whose delta pushes the total above 131072 ends the attempt at once. No later event in the stream is applied or delivered early, even a `response.completed`, `message_stop` or failure event in the same read. The response body is closed, which ends the connection.
- **Result:** a transient failure with the detail `visible output exceeded 131072 bytes`. The attempt record (the `record` of the CLI's `request.attempt` event and of every `provider.Observer`) has outcome `failed`, error `provider_failure`, the new `end_reason` value `output_limit`, unknown usage (no terminal envelope), and no `provider_failure` diagnostics. `stream_bytes` still counts every byte read.
- **After the cut, the existing failed-attempt behaviour applies, unchanged:**
  - Calls that started early in that attempt are aborted and nothing is staged (the existing `sink.Abort`).
  - The request is retried: at most 3 transport attempts, 2 s then 8 s backoff (a stream carries no `Retry-After`).
  - A third cut ends the call as `provider/unavailable`, exit 4, detail `<Label> did not answer after 3 attempts: visible output exceeded 131072 bytes`. For example: `ChatGPT did not answer after 3 attempts: visible output exceeded 131072 bytes`.
  - With `Request.Single` on ChatGPT there is one attempt, then `provider/unavailable` with the detail `visible output exceeded 131072 bytes`.
  - The CLI then emits the `error` event `{class: provider, reason: unavailable, detail: ...}` and `session.ended` status `failed`, and exits 1.
  - The 30-minute (or lowered) absolute budget and caller cancellation keep their precedence. The budget is never renewed.
- **Unchanged:**
  - the non-streaming Chat Completions wire (OpenCode Go, openai-compatible), including its 64 MiB whole-body read;
  - the 64 MiB `streamLimit` and its `stream exceeded 67108864 bytes` result;
  - the silence limits, the retry counts, the request bytes (no `max_output_tokens` is sent; the profile setting stays `provider-default`);
  - every completed response at or under the limit.

Why this bound: normal turns in the research rounds used 125–397 output tokens (about 0.5–1.6 KB). The 128,000-token cap is about 512000 bytes at roughly 4 bytes per token, which is what the fake uses. 131072 bytes is therefore about a quarter of the cap and about 80 times the largest normal turn in the evidence. Even three cut attempts send less than one full-cap response.

Documentation:
- Document the rule in `docs/contract/loop-v1.md` under "Client response budget": the bound, what counts and what does not, the crossing event, the transient detail, the record fields, the retry consequence with both final error texts, `Request.Single`, and that Chat Completions is unaffected and the bound is fixed.
- In the stream-observations bullet, add `output_limit` to the `end_reason` list. Change "the only enforcement is the per-attempt first-byte and idle timeout" so it also names the visible-output limit.
- In README.md, add the 131072-byte visible output of one streamed attempt to the sentence "These limits are fixed, not options".
- Per README, add no CHANGELOG.md entry; the commit message states the change.
- Nothing in Kogen, its vendored copy or its pin changes. No paid or real-provider requests.

## Decisions
- A response that keeps generating visible output far beyond any normal turn is detected from the stream itself and ended early, so the attempt neither burns the whole output cap nor makes the run fail on the cap (source: request)
- Normal long outputs are unaffected; reasoning is not visible output (source: request)
- After the cut, the loop's existing failed-attempt behaviour applies and is stated in the contract: transient retry, 3 attempts, 2 s/8 s, then `provider/unavailable` (source: request)
- No timeout, retry or limit increase and no new option; the bound is a fixed constant (source: request)

## Source comparison
- Addressed: Need 1 (detect and end early from the stream) is covered by the counting rule, the crossing rule and the scenarios "A ChatGPT response that never stops its visible output is cut off and the retry answers" and "An Anthropic response that never stops ...". In those scenarios the client stops reading at fewer than 262144 stream bytes, against about 567000 for a full fake cap.
- Addressed: Need 2 (normal long outputs unaffected) is covered by the exact-131072 ChatGPT and Anthropic answers and by the 300000-byte reasoning and thinking scenarios. All of these complete in one request.
- Addressed: Need 3 (what happens after) is the existing transient path, stated in the rule and the contract, and covered by the retry-answers scenarios and the three-runaway exhaustion scenario with its exact error.
- Addressed: the acceptance evidence asks for an endless fake that is cut well before the cap and a long normal answer that completes unchanged. Both run through the real CLI and finish well under 120 s per step (about 18 s for the whole feature on the scratch prototype).
- Conflicting evidence, recorded and not resolved: the request reports the agent_error `malformed OpenAI-compatible completion` on the "OpenAI Responses route" with gpt-6.1-terra. In this tree that text comes only from the openai-compatible provider, which speaks non-streaming Chat Completions (`provider/provider.go:57`, `provider/respond.go:438` via `adaptChat`). gpt-6.1-terra is a ChatGPT model (Kogen's recommended review default), and on that Responses route the cap ends as `ChatGPT refused the request: stream ...`, as observed above. The research route receipts and notes (notes-harness/loopclimb/batchtool.md lines 22-25 and 42, edit5.md line 180) are not visible from this checkout.
- Omitted deliberately: the Chat Completions wire. Its body is one JSON value that cannot be read before it is complete, and it carries reasoning (OpenCode Go keeps it in the message), so visible output cannot be measured from it as it arrives. A non-streaming body that stays open for 20–30 minutes is also not the streaming behaviour the request describes ("same streaming code on current main"). This wire stays unchanged.
- Kept: kogen-loop 8a2fcda (vendored in Kogen 3e759e88) and current main share this streaming code. Kogen's copy is updated only by Kogen.

## Tests
- Visible output is counted from delta events by UTF-8 bytes, only visible deltas count, the crossing event ends the attempt and the count resets per attempt: add `TestOutputLimitCount` in ./provider, driving `Client.Respond` through the existing scripted transports and injected clock on chatgpt, supergrok and anthropic, with cases for exactly 131072 bytes completing and 131073 ending with `output_limit`, multibyte text (`é` counts 2 bytes) crossing the bound, Responses `function_call_arguments` and Messages `input_json_delta` deltas counting, 300000 bytes of reasoning/thinking deltas, `*.done` events, `output_item.done` items, `response.completed` output and comments still completing, the crossing event winning over a terminal event in the same read, and the count resetting on a retry (unit)
- An endless visible-output stream is cut and the existing retry applies: add `TestOutputLimitRunaway` in ./provider with a real `httptest` server streaming text deltas until disconnect (Responses for ChatGPT and SuperGrok, Messages for Anthropic), asserting the server's request context ends and the body is closed, the record shows outcome `failed`, error `provider_failure`, `end_reason` `output_limit` and `stream_bytes` under 262144, one 2 s backoff precedes a completed second attempt, three runaways give `provider/unavailable` exit 4 `<Label> did not answer after 3 attempts: visible output exceeded 131072 bytes`, and `Request.Single` on ChatGPT makes one request failing with `visible output exceeded 131072 bytes`; this test fails on the unfixed tree (regression)
- The real CLI cuts runaway streams and leaves long normal answers unchanged: acceptance.feature with `features/steps/l_output_cap.js` covers ChatGPT and Anthropic runaway-then-answer (exit 0, 2 requests, first attempt `output_limit`), three ChatGPT runaways (exact exhaustion error, 2 s / 8 s waits), exactly 131072 visible bytes on ChatGPT and on Anthropic after 300000 thinking bytes (one request, completed), 131073 visible bytes cut although the response would complete, and 300000 reasoning-summary bytes completing (scenario)
- Calls started early in a failed attempt are aborted and nothing is published: the existing tool-overlap abort tests (`loop/tool_overlap_abort_test.go`) apply to every failed attempt (existing)
- The Chat Completions wire, `streamLimit`, the silence limits and the retry policy are unchanged: the existing provider, conformance and loop tests pass unchanged, including `TestLStreamMemory` (its padding, unfinished-frame and output-item cases are not counted visible output), plus configured go-format, go-test, go-vet and go-build (existing)
- Contract and README describe the rule: inspect `docs/contract/loop-v1.md` (Client response budget bullet, `end_reason` list with `output_limit`, enforcement sentence) and README.md's fixed-limits sentence during review, with no CHANGELOG.md entry (existing)

## Feasibility
- Scratch observation by this shaping session (a /tmp copy of 4c3a22e, not a Kogen probe record): the drafted acceptance on the unchanged tree finishes 7 scenarios, 3 passed (the long-normal and reasoning cases, which are preserved behaviour) and 4 failed with missing-feature red. The ChatGPT runaway made 1 request and exited 1 with `provider/refused` `ChatGPT refused the request: stream %{"reason" => "max_output_tokens"}` (stream_bytes 567039). The Anthropic runaway exited 1 with `provider/invalid_response` `malformed Anthropic completion`. The 131073-byte answer completed in one request.
- Scratch observation: a throwaway prototype of the rule in that /tmp copy (counting in the Responses accumulator and the Messages frame loop, transient result, `end_reason` `output_limit`) passed all 7 scenarios in 17.7 s. Cut attempts read 164446 (ChatGPT) and 164078 (Anthropic) stream bytes. `go test ./provider ./conformance ./loop` passed unchanged. The fake had already written about 474000 visible bytes into socket buffers when it saw the close, so the acceptance checks what the client read (`stream_bytes`), not what the fake wrote.
- The failing scenarios hide later assertions (end_reason, stream_bytes, waits, the exhaustion error) on the unchanged tree. The observer controls below exercise those checks independently with known-good and mutated observations.
- evidence: {"id":"output-cap-observer","kind":"observer","inputs":["features/steps/l_output_cap.js"],"observers":["features/steps/l_output_cap.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/l_output_cap.js --control good","exit":0,"output":"output-cap observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/l_output_cap.js --control bad","exit":1,"output":"output-cap observer rejected\n"}]}
- No documentation lookup was needed. The event names and shapes come from this repository's parsers and fixtures: `provider/stream.go`, `provider/messages.go`, `conformance/provider_stream_helpers_test.go` and `provider/stream_memory_test.go`.
