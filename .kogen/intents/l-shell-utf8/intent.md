# Sanitize shell output at delivery

Slug: l-shell-utf8
Model: not applicable — byte-to-text normalization has no meaningful state transition
Acceptance:
- .kogen/intents/l-shell-utf8/acceptance.feature
- features/steps/l_shell_utf8.js

Fix L-SHELL-UTF8 in kogen-loop only. Normalize invalid UTF-8 to U+FFFD at the tool-result delivery boundary before bounding text, rather than relying on provider JSON serialization to repair it. Normalize once; repeated delivery must be idempotent. Valid UTF-8 is byte-for-byte unchanged unless the existing bound requires cutting. Preserve the 16384-byte bound, first 4096-byte head, suffix, omission marker/count and character-boundary behavior for valid output. Preserve shell status prefixes, yielding/retrieval envelopes and raw process capture; do not change shell execution or add commands, flags or options. Host-intercepted output remains host-owned. Common text-delivery normalization is acceptable; do not transform typed image parts.

## Decisions
- Replace invalid bytes with U+FFFD rather than introduce an encoding or option (source: request)
- Keep valid text and existing head/tail cutting behavior (source: request)

## Source comparison
- Addressed: request Problem/Need and issue 79a070a8, research 31 Oct 2026: short invalid shell bytes currently survive until provider serialization; this contract requires valid text before serialization, identical to decoded wire text.
- Addressed: request sh_binary evidence (3000 random bytes, reportedly 5.6 KB raw), main 733b50d and Kogen vendored 3e759e88 are historical evidence, not newly verified results. Regression uses a real shell printing 3000 random bytes plus deterministic malformed byte fixtures so reproduction cannot pass by chance.
- Addressed: supplied reproduction reference https://github.com/KogenAI/kogen-bench/tree/abd51bf31f9e8937cba1298ad444043c03a4e53a/reproduce/loop-stream-shell-fault-fixtures/README.md is provenance, not a runtime dependency. Local shell and fake-provider tests reproduce the stated fault without fetching that pack.
- Addressed: Acceptance evidence requires a fake provider to receive normalized text, unchanged valid multibyte output, and preserved over-16-KiB cuts; all are required below and in acceptance.feature. No requested behavior omitted or superseded. Kogen vendoring, publishing and new configuration are outside this fix.

## Tests
- Invalid shell bytes become valid idempotent text before provider serialization: add TestLShellUTF8BinaryRequest with a real shell and fake provider observing pre-serialization and decoded-wire text (regression)
- Normalization preserves valid UTF-8 and byte-bound behavior: add TestLShellUTF8DeliveryCases covering empty, ASCII, multibyte and malformed text at 16383, 16384 and 16385 bytes and replacement expansion (unit)
- Shell valid multibyte and oversized output preserve existing results: add TestLShellUTF8ValidAndCutRequest (integration)

The named tests are implementation-owned Go tests, not protected acceptance helpers. Each must perform the assertions specified in its scenario; a name alone is insufficient. Reuse conformance scripted Requester/round fixtures and existing cut golden tests. At the fake provider assert utf8.ValidString on actual function_call_output text in the second loop request BEFORE JSON marshaling, then serialize/decode the request and assert decoded text equals that exact pre-serialization value. Wire JSON validity alone falsely passes the old bug. For replacement tests use isolated invalid bytes so expected U+FFFD text is unambiguous. For long valid text compute expected retained head, tail and omission count independently or reuse existing golden expectations, not Cut itself as oracle. Existing shell yield/retrieval and cut tests must continue passing.

## Feasibility
- Local invocation go test -json -count=1 -timeout=120s ./conformance -run '^TestLShellUTF8BinaryRequest$' exited 0 in 3.8 s with no tests to run; Go works but the required regression is absent. No external protocol changes or credentials are needed.
