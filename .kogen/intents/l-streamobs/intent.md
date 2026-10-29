# Record provider attempt stream timings

Slug: l-streamobs
Model: not applicable — observational counters and timestamps do not change request, retry, timeout or lifecycle state
Acceptance:
- .kogen/intents/l-streamobs/acceptance.feature
- features/steps/l_streamobs.js

Add stream observations to the existing provider_attempt map written by provider/respond.go record(), for Responses and Messages, without changing transport behavior. Replace hardcoded null ttft_ms with the first parsed token/delta timestamp. Keep observers, existing fields (apart from ttft_ms), requests and event counts unchanged. No new events, options, limits, retries or timeouts.

Times are nonnegative integer milliseconds relative to the individual attempt start already used by record(), not the logical call start. Reset observations for every retry. Capture headers_ms immediately after successful client Do in exchangeResponses, exchangeChat and exchangeMessages. For streaming reads with n>0, first_byte_ms is the first read completion, last_byte_ms the latest, stream_bytes the sum of n. Count gaps between consecutive positive-byte read completions only, excluding headers-to-first-byte and terminal zero-byte reads. max_gap_ms is zero with fewer than two reads. gap_hist is an ordered six-integer array for [0,1000], (1000,10000], (10000,30000], (30000,60000], (60000,120000], (120000,infinity) milliseconds; classify using full duration before millisecond truncation. ttft_ms is the first parsed delta event (Responses *.delta, Messages content_block_delta or message_delta), including reasoning or tool deltas, not headers, comments, start or completion frames. Split frames must not trigger early. Missing observations are explicit null; a stream with no bytes has null first/last/ttft, zero bytes, zero maximum and six zero buckets.

end_reason describes the stream ending, independently of existing outcome/error fields: complete for a normally ended stream, transport for a broken transport including premature unexpected EOF, cancel for caller cancellation/interruption, budget for expiration of the existing budget. Use the same precedence as transportFailure (caller stop before budget before transport), including exits via existing check paths. A dropped stream must not be labeled complete merely because the current parser treats EOF as finish; this telemetry must not change the parser result or retry decisions. Never emit idle. A received normal HTTP refusal is not itself a transport break. For Chat Completions and all other io.ReadAll paths (including HTTP error bodies), set only headers_ms and last_byte_ms; first_byte_ms, ttft_ms, max_gap_ms, gap_hist, stream_bytes and end_reason are null. last_byte_ms is the last positive body read, null for no body bytes, also on partial read errors.

## Decisions
- Add observations only; future idle timeout remains out of scope and off by default when later introduced. (source: request)
- Keep requests byte-identical and observers and existing fields unchanged except replacing ttft_ms null. (source: request)
- Use local fake providers and simulated or short delays; no test waits more than a few seconds. (source: request)
- Re-pin into Kogen afterwards as a separate operator commit using packaging/sync-kogen-loop.sh and the pin-test constant; then research runs the idle-stream experiment. This repository delivery does not mutate an external Kogen checkout. (source: request)
- Shared-host safety: temporary directories only for scratch work, no synthetic CPU load, never kill by name/pattern, and only stop PIDs started by the test. (source: request)

## Source comparison
- Addressed: request What to build and Acceptance map to the field definitions above and the named executable scenarios; all three exchanges and non-streaming/error-body reads are covered.
- Addressed: request Must stay maps to unchanged-wire/retry/observer tests and all configured checks; no new timeout, option or event is authorized.
- Addressed: request Why retains the motivation: research by kogen-research-owner on 29 Oct 2026 observed productive Sol-high streams up to 825 s at about 35 tok/s cut by K-RESPBUDGET-DEFAULT's 10-minute absolute budget. proposals/stream-timeouts-2026-10-29.md proposes first byte 90 s and idle 120 s. These are motivation, not settings in this delivery; the repository currently documents a 30-minute budget and this Intent does not change it.
- Addressed as subsequent operator work: request Then retains packaging/sync-kogen-loop.sh plus the pin-test constant, followed by research; README local compatibility says Kogen synchronization happens separately. No external pin success is claimed by this Build.
- Superseded: provider/respond.go hardcoded ttft_ms null for streams; existing tests must retain null expectations only where no delta was received or the read is non-streaming.
- Omitted: no requested behavior; no paid research or live provider calls are needed for local timing instrumentation.

## Tests
- Stream timestamps, byte counts, parsed first delta and per-attempt reset: add TestStreamObsTiming using Client.Respond and Observer with scripted local Responses and Messages streams, split delta frames, comments before delta, zero-byte reads and retry isolation (integration)
- Gap calculation and exact bucket boundaries: add TestStreamObsGaps covering each boundary and adjacent duration values with simulated time, zero/one/multiple positive reads and all six ordered counts (unit)
- End classification without changing existing result semantics: add TestStreamObsEndReasons with clean, dropped, caller-cancelled and budget-expired streams on Responses and Messages, including cancellation/budget check exits and partial observations (integration)
- Non-streaming nullability: add TestStreamObsNonStreaming for Chat Completions and Responses/Messages HTTP error-body ReadAll paths including empty and partial bodies (integration)
- Byte-identical request and unchanged observer/event, result, retry, timeout and existing field behavior: add TestStreamObsCompatibility and retain useful existing provider tests, updating only changed timing expectations (regression)
- All configured checks: run go-format, go-test, go-vet and go-build exactly as configured in .kogen/project.yaml (existing)

## Feasibility
- The local Go test JSON route works; TestStreamObsTiming is absent on baseline, so package success alone cannot qualify acceptance. Probe exited 0 in 2.4 seconds and reported no tests to run; the step requires a named pass event.
