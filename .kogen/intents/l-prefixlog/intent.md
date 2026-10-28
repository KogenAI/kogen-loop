# Add opt-in request prefix divergence events

Slug: l-prefixlog
Model: .kogen/intents/l-prefixlog/model.qnt invariants=Released,Bounded seed=28 samples=100 steps=20
Acceptance:
- .kogen/intents/l-prefixlog/acceptance.feature
- features/steps/l_prefixlog.js

Instrument the provider library only. Preserve encoded bodies, headers, retry policy and existing attempt records. Research seed: 28 Oct 2026; the older measurement concerned provider/wire.go encodeBody and jsonenc.go. Do not implement cache optimization or claim cache benefits.

## Decisions
- Emit for each actual model HTTP attempt, including retries and cache-control rejection retries, comparing the bytes about to be sent, not the initial logical Respond body. Auth/token requests do not count. (source: answer 1)
- Use `Client.PrefixLog func(PrefixEvent)` as the opt-in; nil is off. Add `PrefixEvent` with exported fields `ConversationID string`, `Role Role`, `Context map[string]any`, `PreviousBytes *int`, `CurrentBytes int`, `Offset *int`, `Status string`. Status is `first`, `identical`, or `diverged`; first has nil previous size and offset, identical has both sizes and nil offset, diverged has both sizes and a zero-based offset. Context is a snapshot of Request.Context so hosts can group by role label without body contents. The callback is synchronous before the model transport attempt and has no error return. Configure it before concurrent use. (source: answer 1)
- Conversation identity follows existing CacheID or resolved provider/model/Scope cache identity, client-local. Expose `Client.EndPrefixLog(req Request)` to delete only that conversation's instrumentation state without creating cache identities or altering prompt-cache state. Direct provider callers must call this when their conversation ends, including error/cancellation endings; document a defer example. Ending and reusing the identity starts with `first`. Do not treat the end of a Respond call as conversation end. (source: answer 1)
- Retain only the immediately previous exact body per active conversation, never historical bodies or body text in events/checkpoints. Bound retained bytes to the accepted request-body limit per active conversation (current default 524288 bytes); total storage is proportional to active conversations, released by EndPrefixLog. No approximate hash offset. Client concurrency safety remains; concurrent attempts for one identity are ordered at the instrumentation boundary. No new CLI/task option or protocol event. (source: request)
- For strict-prefix bodies the divergence is the shorter length. Identical includes equal length. Off adds no instrumentation allocations or retained state and no callbacks; Render/Body measurements never advance history. (source: request)
- Research consumers may compute share of early prefix breaks per role from these events; no threshold, aggregator, dashboard or paid provider experiment is added. (source: request)

## Source comparison
- Addressed: request Why/What and answer 1 map to the callback and actual-attempt comparison above and the retry integration test. Current provider/respond.go encodes initially and can re-encode on retry; instrumentation must see each final sent body across Responses, Chat Completions and Messages.
- Addressed: acceptance literal 10 KB / byte 10,240 maps to exact zero-based 10240 in acceptance; identical maps to status identical (the documented representation of “no divergence”). First has no offset, with a distinct status.
- Addressed: Must stay maps to byte fidelity, nil-option allocation/state checks, and absence of CLI/task changes. docs/contract/loop-v1.md must document the library event and lifecycle example. Existing Observer.Attempt and standalone event schema remain unchanged.
- Addressed: bounded memory/release maps to single-body retention and explicit EndPrefixLog, not an unbounded history or a cache checkpoint field. Existing Cache has no conversation-end hook, so hosts explicitly delimit this instrumentation lifetime.
- Addressed: metric is enabled by Role and Context; research seed is historical motivation, not evidence of measured benefit. Host safety applies to all tests: temporary directories only, no synthetic CPU load, no process-name/pattern kills; terminate only owned pids.
- Omitted deliberately: no cache behavior changes, CLI, quota claims or research analytics, as the request is instrumentation only. No supplied reproducing example is omitted or superseded.

## Tests
- First, identical, divergence and strict-prefix byte semantics: add TestPrefixLogOffsets with 10239, 10240 and 10241 boundaries, byte-zero and multibyte UTF-8 cases through callable comparison behavior (unit)
- Actual attempts across all three wire formats including changed and unchanged retries: add TestPrefixLogAttempts using existing offline provider fixtures and captured transport bytes, independently compute expected offsets from sent bytes (integration)
- Nil callback preserves bytes and emits nothing with no instrumentation allocation/state: add TestPrefixLogOff comparing on/off transport captures and focused instrumentation allocation coverage (integration)
- Conversation isolation, previous-body replacement, release and reusing an ended identity: add TestPrefixLogLifetime exercising explicit and resolved identities and EndPrefixLog, including error/cancellation cleanup by callers (integration)
- Render/Body do not emit or update history and events carry role/context without request contents: add TestPrefixLogMetadata (integration)
- No CLI/task or existing protocol changes and all configured checks: retain existing conformance tests and run configured go-format, go-test, go-vet, go-build plus go test -race ./... and go test ./conformance -count=1 (existing)

Implementation tests named above are builder-owned normal Go tests, not protected acceptance helpers. They must assert behavior, not merely existence. TestPrefixLogAttempts must include an actual Respond-to-local-transport path proving the 10240 example with both sizes verified against captured bodies; construct padding from the measured encoding prefix, not a guessed JSON overhead. Documentation review verifies the callback example, first/identical distinction, zero-based bytes, lifecycle, memory bound and no body disclosure.

## Feasibility
- The small lifecycle model typechecked with the bundled Quint executable (probe: exit 0, 0.2 s). It abstracts previous-body replacement, off/no-op, and explicit release; byte comparison is covered by Go tests. No external provider facts change or require research; all transport proof is offline.
