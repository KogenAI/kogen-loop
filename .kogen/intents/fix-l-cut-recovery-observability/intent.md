# Record that invalid-byte cut reads cannot happen

Slug: fix-l-cut-recovery-observability
Model: not applicable — the scenario does not reproduce, so nothing in the product changes; the acceptance only observes one unchanged read_file round through the CLI
Acceptance:
- .kogen/intents/fix-l-cut-recovery-observability/acceptance.feature
- features/steps/fix-l-cut-recovery-observability__session.js

An automated review of the landed l-cut-recovery-observability commit claimed this: `CutOmitted` computes offsets on scrubbed text, where each invalid UTF-8 byte becomes a 3-byte U+FFFD. `readLinesOf` (loop/session.go) then slices `raw[:to-1]` with those offsets, so a cut numbered read of a file with invalid bytes would panic or report wrong `omitted_lines`. The request says: first reproduce it with a test that fails on current main for exactly this scenario; if the scenario does not hold on main, stop and report that it does not reproduce (no code change). Otherwise, scrub `raw` once before computing offsets, add a conformance test with invalid bytes, keep every existing test green and make no unrelated changes.

The scenario does not hold on main (HEAD 9cf6e83), so this Intent takes the request's stop branch. It changes no production code and no Go test: the Build edits nothing outside the Intent's own files. `loop/session.go`, `tools/tools.go` and the conformance tests stay byte-for-byte unchanged. Specifically, `readLinesOf` is not changed to scrub `raw`, and no invalid-byte conformance test is added. The only deliverable is this record and its acceptance, which runs the real CLI and shows that the reported input never reaches the offset arithmetic.

Why it does not reproduce. `readLinesOf` uses `CutOmitted`'s offsets on `raw` only for a `read_file` result that `tools.NumberedRange` accepts. Its only caller (`loop/session.go:404`) passes `out.Text` from the session's own `*tools.Tools`. A `read_file` result never contains invalid UTF-8:
- A file whose content has a NUL byte or invalid UTF-8 never gives numbered text. Whatever `start_line` and `end_line` say, it gives exactly `<path>: binary file, <N> bytes (contains a NUL byte or is not valid UTF-8); content not shown` (`tools/tools.go:443-445`, `docs/contract/loop-v1.md:210`). Any other file is valid UTF-8, and `numbered` splits it only at `\n`, so its output stays valid.
- The path echoed in that notice is valid UTF-8. Call arguments with invalid UTF-8 or an unpaired surrogate escape decode as invalid (`tools/json.go:191-197`, `tools/conversation.go:109-115`), and `read_file` answers `error: argument path must be a string`.
So `CutOmitted`'s scrub never changes the text here, and its offsets index `raw` exactly.

## Decisions
- The reported scenario does not reproduce on main, so no code change is made: `readLinesOf` keeps slicing `raw`, and the scrub and the invalid-byte conformance test the request makes conditional are not added (evidence: tools/tools.go, tools/json.go, loop/session.go; ran `node features/steps/fix-l-cut-recovery-observability__session.js --observe <arguments>` on a scratch copy of HEAD 9cf6e83). (source: request)
- The non-reproduction is recorded as passing acceptance through the real CLI, not as a new Go test: a test that fails on main for this scenario cannot be written, because no read produces it (evidence: ran a scratch `go test ./loop -run TestZZProbe` on a copy of HEAD; a 39000-byte file with FF FE bytes gave the binary notice and `readLinesOf` treated it as not numbered). (source: request)

## Source comparison
- Reproduce first with a test that fails on main for exactly this scenario: addressed. Running the real CLI on a 25092-byte, 600-line file with FF FE bytes on every line (as a whole-file read and with `start_line` 1, `end_line` 2000), and with an arguments text whose path holds an unpaired surrogate escape, shows the scenario does not occur. Acceptance scenarios 1–3.
- If it does not reproduce, stop and report, with no code change: addressed. This Intent's prose and Decisions report it, and the Build changes no product or Go test file.
- Scrub `raw` once before computing offsets: omitted, as the request directs, because the scenario does not reproduce.
- Add a conformance test with invalid bytes: omitted for the same reason; the invalid-byte observation lives in this Intent's acceptance.
- Keep every existing test green; no unrelated changes: addressed, because no existing file changes.

## Tests
- A read_file of a file whose content has invalid UTF-8 bytes, whole or with a line range, stays the binary notice, uncut and with no omitted_lines or recovers field on its tool.result event (unchanged): tools/read_file_binary_test.go TestReadFileNamesBinaryFiles plus acceptance scenarios 1 and 2 through the CLI (existing)
- A read_file call whose arguments hold an unpaired surrogate escape gets `error: argument path must be a string` with malformed_class missing_argument and no omitted_lines (unchanged): acceptance scenario 3 through the CLI (existing)

## Feasibility
- Repository inspection: the only route to `readLinesOf` is `Session.Round`'s `HandleCall` with the session's own `*tools.Tools`. `read_file` returns the binary notice for any file with invalid UTF-8, and argument decoding rejects invalid UTF-8 and unpaired surrogates. No external protocol, provider or library fact is involved, so no documentation lookup was needed.
- Scratch probe on a copy of HEAD 9cf6e83 (Go 1.27.2, Node 24.21.0) driving the built CLI through this step file's scripted provider. `{"path":"bad.txt"}` and `{"path":"bad.txt","start_line":1,"end_line":2000}` delivered `bad.txt: binary file, 25092 bytes (contains a NUL byte or is not valid UTF-8); content not shown` with tool.result `cut` false and no extra fields. `{"path":"bad\udcff.txt"}` delivered `error: argument path must be a string` with `malformed_class` `missing_argument`. Each session ended with the finish call and exit 0.
- evidence: {"id":"invalid-byte-read-observer","kind":"observer","inputs":["features/steps/fix-l-cut-recovery-observability__session.js"],"observers":["features/steps/fix-l-cut-recovery-observability__session.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/fix-l-cut-recovery-observability__session.js --control good","exit":0,"output":"invalid-byte read observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/fix-l-cut-recovery-observability__session.js --control bad","exit":1,"output":"invalid-byte read observer rejected\n"}]}
