# Carry an opt-in read ledger across resets

Slug: l-ledger
Model: .kogen/intents/l-ledger/model.qnt invariants=Bounded seed=7 samples=100 steps=30
Acceptance:
- .kogen/intents/l-ledger/acceptance.feature
- features/steps/l_ledger.js

Add a library-only read ledger and explicit caller-owned continuation. Do not add an automatic reset: FailOverBudget still refuses without sending or clipping. The caller may discard its working conversation and call the continuation interface, then pass its returned input to Run. No Kogen caller integration, CLI/task option, provider transport change, publication or research benchmark is in scope.

## Decisions
- Keep over-budget refusal and target caller-initiated working-window reset, including Kogen builder/review fresh-conversation use without modifying Kogen here. (source: answer 1)
- Default off; no CLI; no timeout, limit default or reset trigger changes. (source: request)
- Use a fixed 8192-byte ledger-message cap and 80-Unicode-scalar note truncation. The mandated note is the only source-text excerpt allowed; “no file bytes” means no full read results, image payloads or replayed tool outputs in the continuation. (source: answer 1)
- Provide Round.ReadLedger *ReadLedger (nil disables), NewReadLedger() *ReadLedger, and (*ReadLedger).Continuation(base []any) (input []any, event map[string]any). Caller owns one ledger per logical round across Run invocations and records the returned reset event. No automatic standalone reset events exist because the standalone interface has no reset. (source: answer 1)

Implement these exact library interfaces in package loop. The ledger pointer is updated during successful nonterminal built-in read_file and view_image execution, including reads before a later Run error. Do not infer success by parsing text starting with `error:`: preserve structured success metadata from tool execution without changing model-facing output. Handled host outputs are not built-in reads and are outside this ledger. Do not record failed, terminal or skipped calls. Duplicate successful reads produce separate ordered entries. Do not reopen files to compute hashes: use the returned content snapshot.

Continuation copies base (fresh caller sources/instructions), appends exactly one user message with string content containing compact JSON, and does not mutate base. It never includes old conversation items. The JSON object is {"type":"read_ledger","dropped":N,"entries":[...]}; each text entry has tool, path, start_line, end_line, sha256, note. Ranges are actual returned inclusive 1-based lines (empty result uses 0,0). Hash is lowercase SHA256 of the final delivered text output, including line numbers and any delivery truncation marker; note is the first non-empty source line in that delivered output with numbering removed, trimmed, truncated to 80 Unicode scalars without a suffix. Empty output has empty note and SHA256 of empty bytes. Each image entry has only tool, path, sha256: use the image snapshot's existing SHA256, never typed parts/base64, dimensions or note. Paths retain the tool argument spelling. Serialize deterministically using encoding/json. Count UTF-8 content bytes including JSON envelope, not the enclosing provider message. Evict oldest entries until content fits 8192 bytes; a single oversized entry is itself dropped. Dropped count is cumulative, including oversized entries; no deduplication. Continuation itself does not clear the ledger or increment dropped. Empty enabled ledger still emits one message. Reads on later Run invocations using the same pointer extend retained history.

The returned event is {"event":"read_ledger_reset","entries":N,"bytes":B,"dropped":D}, with B equal to serialized ledger-content UTF-8 bytes. Each explicit continuation produces this event even for an empty ledger. This is the Go caller's run-event record to emit through its existing sink; add no CLI event stream or hidden automatic reset. Document usage, cap, hash semantics, note disclosure, ownership, reset event, off behavior and unchanged budget refusal in docs/contract/loop-v1.md. Nil Round.ReadLedger must leave requests, result serialization and tool output bytes exactly unchanged.

## Source comparison
- Addressed request items 1–2 and fake-requester two-read/image/cap acceptance by the ReadLedger collection and Continuation contracts above and all acceptance cases below.
- Superseded request's assumed loop/loop.go FailOverBudget/reset path by answer 1: caller explicitly resets; existing FailOverBudget refusal remains unchanged. No automatic reset or Kogen adoption is promised.
- Addressed request item 3 by a reset-event return value for the caller-owned run-event sink; this deliberately moves reset-event emission to the caller with the reset itself (answer 1).
- Addressed item 4 by docs/contract/loop-v1.md; Must stay requirements by nil compatibility and existing configured checks. No CLI or default changes.
- Addressed research context READ-CONTEXT candidate 2, 28 Oct 2026 as motivation, not an implemented benchmark: resets, repeat reads after reset and landed cells on large working sets remain research metrics, not claimed results. Host safety applies to all tests: private temp directories, no synthetic CPU load, no process-name/pattern stopping, only owned pids.
- Clarified request's simultaneous one-line note and “no file bytes” with the bounded-note exception above; image references have no excerpt. No other requested behavior is omitted.

## Tests
- Successful read snapshots, exact ranges, hashes, note selection/truncation, empty output and failures: add TestReadLedger/text_metadata using real temporary files and the public Run interface (integration)
- Two reads followed by explicit forced continuation reach the first fresh fake request as one compact message with both entries and no old output: add TestReadLedger/reset_two_reads (integration)
- Image snapshots are only path/hash references across reset: add TestReadLedger/image_reference using a real supported PNG (integration)
- FIFO cap and cumulative dropped count at below/exactly/above 8192 bytes, including oversized single entries and repeated reads: add TestReadLedger/cap_fifo (unit)
- Reset event sizes and empty/repeated continuation with later reads: add TestReadLedger/reset_events (integration)
- Nil option preserves existing request/result bytes, including tool errors: add TestReadLedger/off_identical against fixed baseline expected messages/results, not two calls to changed code (regression)
- Budget refusal, timeout/default/CLI compatibility and all configured checks: retain existing suites unchanged and add TestReadLedger/budget_unchanged proving enabled reads survive refusal without implicit reset (existing)
- Document the library-only option and continuation example: inspect maintained caller contract during review (existing)

## Feasibility
- Local state model typechecked and ran with TypeScript backend, 20 samples and 10 steps: no violation, exit 0 (probe 1, 0.9 s). This abstracts retained-entry capacity, not the byte serializer. No external dependency or protocol changes require documentation lookup.
