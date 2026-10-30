# Bound streaming provider response memory

Slug: l-stream-memory
Model: not applicable — a monotone per-attempt byte ceiling is a local validation rule, not an interacting state machine
Acceptance:
- .kogen/intents/l-stream-memory/acceptance.feature
- features/steps/l_stream_memory.js

Bound each successful streaming HTTP response on both Responses routes (including SuperGrok) and Anthropic Messages to one shared hardcoded 64 MiB (67108864 bytes) ceiling. Count all incoming body bytes, including ignored comments, pings, framing and unfinished frames, cumulatively per attempt. Exactly the ceiling is permitted; reject the first read that would exceed it before appending, feeding the parser or decoding that read. Retained stream data and parsed output must remain bounded by that fixed input ceiling (ordinary bounded parser/buffer overhead is allowed). Close the body and return a classified provider failure with no partial response or tool calls. Use the existing provider error machinery; do not turn overflow into successful EOF. Ordinary retry policy need not change, but every attempt must be independently bounded and retries finite as today.

Keep all below-limit valid responses, streaming semantics, timers, usage, diagnostics and normal streaming tests unchanged. No setting, environment override, public API field or new dependency. Do not change the non-streaming Chat route. Add focused Go regression coverage through Client.Respond using local fake transports and existing private credential/test helpers, not paid requests. Production edits are expected in provider/respond.go with minimal supporting provider edits only if needed.

## Decisions
- Use one fixed constant, not an option; preserve real-response handling. (source: request)
- Scope is audit finding 4 only; process lifecycle findings 1–3 and shell timeout policy are not changed. (source: request)
- Shared-host tests use temp directories and only owned resources; never stop processes by name/pattern, create synthetic CPU load, or access live services. (source: request)

## Source comparison
- Addressed: request L-STREAM-MEMORY and audit finding 4's unbounded Anthropic accumulation and Responses unfinished-frame/output accumulation are covered by the common cumulative 67108864-byte ceiling and TestLStreamMemory below.
- Addressed: request acceptance requires fake overflow to produce provider failure, unchanged normal streaming tests and all configured checks including -race; these are required implementation gates below.
- Superseded: audit finding 4's suggested separate frame/item limits and incremental Anthropic rewrite are evidence, not requested design authority. One total byte ceiling bounds these cases without introducing multiple limits or changing normal parsing.
- Omitted deliberately: audit findings 1–3, historical snapshot paths/hashes, sibling Kogen changes, publishing and timeout policy are background evidence and outside this fix. Current provider/respond.go still accumulates Anthropic all and feeds Responses without a total byte limit.
- Addressed: README standard-library-only and offline fake-provider conventions and supplied testing rules govern the regression; no configuration/protected implementation edits are required.

## Tests
- Streaming attempts reject more than 67108864 bytes before retaining the overflowing read and close the body without exposing partial calls: add TestLStreamMemory through Client.Respond for chatgpt, supergrok and anthropic using a lazy generated finite fake body, asserting typed provider failure, nil response, closure and bytes read no greater than ceiling plus one 32768-byte read per attempt (regression)
- Informational traffic, unfinished frames and accumulated output all count toward the same total: TestLStreamMemory covers repeated complete Anthropic ping frames, an unfinished Responses SSE frame, and valid Responses output-item events whose aggregate exceeds the ceiling; fake streams must be bounded to ceiling plus two read buffers so the unfixed tree fails safely, not exhaust memory (regression)
- Ceiling and adjacent valid byte counts remain allowed: TestLStreamMemory includes valid complete answers padded with ignored SSE comments to 67108863 and 67108864 bytes on each streaming wire, plus 67108865-byte overflow cases; control chunking so the terminal event is in the final read, and assert the normal answer below/at the bound (regression)
- Normal response behavior is preserved: existing provider streaming/idle/observation and conformance tests remain unchanged and pass; run go test -race ./..., go test ./conformance -count=1, go vet ./..., go build -o /dev/null ./... and configured go-format/go-test/go-vet/go-build checks (existing)

## Feasibility
- The existing standard-library fake transport helpers support Client.Respond tests without external protocol changes or research. No external capability assumption is introduced.
- Probe: go test -json -count=1 -timeout=120s ./provider -run '^TestLStreamMemory$' exited 0 in 28.0 s and reported no tests to run; the required named regression does not yet exist. Acceptance must reject this empty green.
