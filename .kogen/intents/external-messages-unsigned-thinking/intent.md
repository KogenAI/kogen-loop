# Accept unsigned thinking on external Messages

Slug: external-messages-unsigned-thinking
Model: not applicable — the change is one stateless validation rule in the Messages response parser
Acceptance:
- .kogen/intents/external-messages-unsigned-thinking/acceptance.feature
- features/steps/external-messages-unsigned-thinking__driver.js
- features/steps/external-messages-unsigned-thinking__driver/driver_test.go.txt

An observed stream from the explicit external `messages-compatible` route had HTTP 200, a thinking block of 74 characters with an empty signature, then valid `read_file` and `list_files` tool_use blocks and stop_reason `tool_use`. `provider/messages.go` `messageState.result` rejected the whole completion because every thinking block needs a nonempty signature. On the external route only, a thinking block whose `thinking` is a string and whose `signature` is absent or the empty string (unsigned thinking) becomes valid. The native `anthropic` route keeps requiring a nonempty string signature. The complete provider message, including its original thinking text and no invented signature, is kept and replayed once in the next request as today. Nothing else changes: no retry on another route, no thinking/model setting change, no default or model-adoption change, no cache-accounting change, no live or paid call. A new live qualification and the role studies stay separate; this fixes the parser only.

## Decisions
- The rule lives in `messageState` (which already carries `external`): thinking validity is `thinking` is a string and the signature is a nonempty string, or, only when `external`, absent or the empty string. A present non-string signature (number, null, object) and a non-string `thinking` stay invalid on both routes. (evidence: provider/messages.go; provider/respond.go) (source: request)
- Replay needs no change: the assistant block map is already retained verbatim in `anthropic_message`; an absent signature stays absent and an empty one stays empty, never invented or stripped. (evidence: provider/messages.go) (source: request)
- Whole-response validation is unchanged: a malformed tool block, duplicate tool id, invalid stop reason or usage anywhere still rejects before any call is exposed; cut streams stay transient (three attempts then unavailable) on both routes. (evidence: provider/messages.go; provider/respond.go) (source: request)
- Empty `thinking` text with an absent or empty signature on the external route is accepted by the same rule; the request does not distinguish it. (assumption: confirm unsigned empty thinking should be tolerated on the external route) (source: request)
- Acceptance runs a Go driver copied into a scratch copy of the module as an external `provider_test` file against a local fake server through the public `Respond`; the tool cycle executes real file reads and listings in the test, because the loop engine is not needed to observe request/replay custody. (evidence: provider/messages_test.go; features/steps/experimental-messages-route-bounds__route.js) (source: request)

## Source comparison
- Addressed: scenarios 1-6 of the request map to the six feature scenarios (recorded response; absent vs non-string; offline tool cycle with preserved thinking and matching tool_use_ids; strict Anthropic rejection and signed replay; malformed/duplicate mixed with unsigned thinking; cut stream, invalid stop and usage unchanged).
- Omitted deliberately: live Qwen calls, credentials, defaults, cache-accounting redesign, the Lab-only budget instrumentation patch, the evidence archive itself.

## Tests
- Recorded unsigned response accepted with both tool ids once: TestUTRecordedExternalResponseIsAccepted (integration)
- Absent signature unsigned, non-string values invalid: TestUTAbsentSignatureIsUnsignedAndBadTypesStayInvalid (integration)
- Offline tool cycle keeps original thinking and matching results: TestUTExternalToolCycleKeepsProviderThinking (integration)
- Strict Anthropic still requires a signature, signed replay unchanged: TestUTStrictAnthropicStillRequiresSignature (regression)
- Malformed or duplicate tools reject the whole response: TestUTMalformedOrDuplicateToolsRejectWholeResponse (integration)
- Cut stream, invalid stop and usage unchanged: TestUTCutStreamAndStopHandlingUnchanged (regression)

## Feasibility
- none
