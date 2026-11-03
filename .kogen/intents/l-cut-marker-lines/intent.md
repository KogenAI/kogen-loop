# Name omitted lines in the tool result cut marker

Slug: l-cut-marker-lines
Model: not applicable — the cut is a pure function of one text; it keeps no state between calls
Acceptance:
- .kogen/intents/l-cut-marker-lines/acceptance.feature
- features/steps/l_cut_marker_lines.js
- features/steps/l_cut_marker_lines_driver.go

The 16384-byte cut of a delivered text tool result (`tools.Cut`, `Output.Cut()` and the shared `cutText` the shell envelope uses) currently marks the omitted middle only with `\n[... N bytes omitted ...]\n`. A byte count does not tell the model how many lines were dropped, and for a cut `read_file` result it does not map to the `start_line`/`end_line` the model needs to see the missing middle. After this change, when both cut points fall on line boundaries the marker also states the number of complete lines omitted, and when the text is numbered `read_file` text it also states the omitted line-number range. Every other cut keeps the byte-only marker and its exact bytes as today.

Unchanged: the 16384-byte bound including the marker, the 4096-byte head budget and how the head is chosen, UTF-8 normalization, fitting text delivered verbatim, idempotence (a cut text fits, so cutting it again changes nothing), typed image output passing `Output.Cut()` unchanged, the shell envelope's binary search for the largest output that keeps the JSON envelope within 16384 bytes, and the separate 512 KiB head/tail capture marker of `sys` (`capBuffer`), which is not this cut and keeps `\n[... N bytes omitted ...]\n`.

## Rule

`cutText(text, bound, headSize)` for normalized `text` longer than `bound` (`Cut` uses bound 16384 and head 4096; the shell envelope uses `mid` and `mid/4` as today):

1. Head: unchanged. `validPrefix(text[:headSize])`, shortened to end just after its last `\n` when it has one.
2. Line form. Only when the head ends with `\n`:
   - The text is *numbered* when every line (split at `\n`; a final `\n` ends the last line, it does not start an empty one) begins with a decimal number without leading zeros, at least 1, immediately followed by a tab, and each line's number is the previous line's number plus 1 (the first line may start at any number). `read_file` results (`numbered()`, also the `Snapshot` `read_file` sections) are numbered text.
   - Reserve the width `W` of the widest line marker: for plain text `\n[... T lines, T bytes omitted ...]\n`, for numbered text `\n[... T lines (Z-Z), T bytes omitted ...]\n`, where `T` is `len(text)` written in decimal and `Z` is the number of the text's last line.
   - Tail candidate: `validSuffix(text[len(text)-(bound-headSize-W):])`. When it contains `\n`, the tail is the part after its first `\n` (it may be empty), and the result is `head + marker + tail` with the omitted middle `text[len(head):len(text)-len(tail)]`, which then consists of `L` complete lines (`L` = its count of `\n`):
     - plain text: `\n[... L lines, N bytes omitted ...]\n`
     - numbered text: `\n[... L lines (a-b), N bytes omitted ...]\n`, where `a` is the number of the first omitted line and `b = a+L-1` the last; `a-b` is written even when `a == b`.
     - `N` is the byte length of the omitted middle; when `L` is 1 the unit is `line` instead of `lines` (`\n[... 1 line, 80 bytes omitted ...]\n`, `\n[... 1 line (7-7), 40 bytes omitted ...]\n`).
   - When the candidate contains no `\n`, the line form does not apply.
3. Otherwise (the head has no line boundary, or the line-form tail has none): exactly today's result, the byte-only `\n[... N bytes omitted ...]\n` with the tail chosen under today's reservation `len("\n[... T bytes omitted ...]\n")`. So a single long line, or a short first line followed by one long line, is cut byte for byte as today.

Examples (all observed with a scratch implementation of this rule): 40000 bytes of 80-byte lines (`"x"*79 + "\n"`) give the first 51 lines, `\n[... 296 lines, 23680 bytes omitted ...]\n` and the last 153 lines; the engine's `read_file` delivery of a 1200-line file whose line i is `row i ` followed by 24 `y` gives the first 116 numbered lines, `\n[... 765 lines (117-881), 28305 bytes omitted ...]\n` and the last 319; 30000 `x` give the first 4096 bytes, `\n[... 13647 bytes omitted ...]\n` and the last 12257 bytes (unchanged); `exit status: 0\n` plus 29985 `a` give the first 15 bytes, `\n[... 17728 bytes omitted ...]\n` and the last 12257 bytes (unchanged).

The Build updates the recorded and documented cut where it now changes: the `lines` entry of `contract/testdata/cut_bytes.json` (checked by `TestCutRecordedBytes`) becomes the first 51 lines, `\n[... 296 lines, 23680 bytes omitted ...]\n` and the last 153 lines; the shared `checkDelivery` helper and `TestCutLineAligned` in `tools/` accept and check the line forms; and the "Tool result cut (fixed)" paragraph of `docs/contract/loop-v1.md` describes the three marker forms. The `bytes omitted ...]` text that `contract/README.md` and existing tests look for stays in every form. Acceptance files of earlier Intents under `.kogen/intents/` are historical records and are not edited.

## Decisions
- The line marker keeps the existing `[... ` opening and the `N bytes omitted ...]` ending and puts the line count first: `[... L lines, N bytes omitted ...]` (source: request)
- A numbered (`read_file`) cut puts the range after the count: `[... L lines (a-b), N bytes omitted ...]`, so `start_line=a`, `end_line=b` recovers exactly the omitted lines (source: request)
- One omitted line is written `1 line` (source: request)
- A cut counts as line-structured only when the head ends at a line boundary and the tail starts just after one; any other cut, including a single long line, keeps the byte-only marker (source: request)
- `read_file` text is recognized from its content (consecutive `N<tab>` lines), so `tools.Cut(string)`, `Output.Cut()` and their signatures stay as they are (source: request)

## Source comparison
- Problem: byte-only marker gives no line count and no `start_line`/`end_line` range: addressed by the line and range forms in Rule step 2.
- Need: line count for line-structured text: Rule step 2 plain form; acceptance "Plain lines name the omitted bytes and lines".
- Need: omitted line-number range for a cut `read_file` result: Rule step 2 numbered form; acceptance "A read_file result names the omitted line range" through `loop.Run` delivering a real `read_file` result.
- Need: non-line-structured text keeps the byte-only marker: Rule step 3; acceptance "A single long line keeps the byte-only marker" and "A cut inside one long line keeps the byte-only marker".
- Need: bound 16384 including the marker, idempotence and typed image pass-through unchanged: Rule step 2 reservation and the unchanged list; acceptance outlines for the bound, fitting text and re-cutting; typed parts by the existing `TestCutOfAnOutputPassesTypedPartsUnchanged`.
- Synthetic acceptance 1 (40000 bytes of plain lines; head + omitted + tail lines equal the original count): acceptance "Plain lines name the omitted bytes and lines" (51 + 296 + 153 = 500).
- Synthetic acceptance 2 (numbered text of 1200 lines; range `a-b`; head ends at a-1, tail starts at b+1): acceptance "A read_file result names the omitted line range" (range 117-881).
- Synthetic acceptance 3 (single long line keeps byte-only marker as today): acceptance "A single long line keeps the byte-only marker" with today's exact bytes.
- Synthetic acceptance 4 (total <= 16384 for 16385, 16400, 99999 and 1e6 bytes): acceptance outline "The marker width stays within the bound" for plain, numbered and single-line text of each size (1e6 written as 1000000).
- Synthetic acceptance 5 (fitting text unchanged; cutting a cut text changes nothing): acceptance outlines "Text that fits is delivered unchanged" and "Cutting an already cut text changes nothing"; every cut step also re-cuts.
- Synthetic acceptance 6 (shell envelope near the bound stays valid JSON and <= 16384): acceptance outline "The shell envelope near the bound stays valid JSON" with JSON-escaping line output of 16000, 16385 and 40000 bytes, through a real shell call yielded by the `ShellAfter` seam and retrieved by its handle.
- Omitted: the `sys` capture-buffer marker is a different mechanism the request does not name; it stays unchanged.

## Tests
- Line-structured plain text gets `[... L lines, N bytes omitted ...]` with L the complete omitted lines: update `TestCutLineAligned` (`lines` case) and the shared `checkDelivery` helper in `tools/cut_output_test.go` to accept the line forms and check N, L and the range against the text (unit)
- Numbered text gets `[... L lines (a-b), N bytes omitted ...]` with a the first and b the last omitted line number: update the `numbered` case of `TestCutLineAligned` to assert the range and that the head ends at line a-1 and the tail starts at line b+1, including text numbered from a start other than 1 (unit)
- A cut `read_file` result delivered by the engine names its omitted range: acceptance scenario "A read_file result names the omitted line range" through `loop.Run` (scenario)
- One omitted line is written `1 line`: add a `tools.Cut` unit case whose omitted middle is exactly one line (for example 16385 bytes of 80-byte lines gives `[... 1 line, 80 bytes omitted ...]`) (unit)
- Non-line-structured cuts keep today's byte-only marker and bytes: existing `TestCutMatchesTheElixirCut` golden cases, `TestCutKeepsHeadAndTailAroundAMarker` and `contract` `TestToolsShellRunsInTheRootAndCutsOutput` pass unchanged (existing)
- The marker width is reserved so every result stays within 16384 bytes for 16385, 16400, 99999 and 1000000 bytes of plain, numbered and single-line text: add these sizes to the cut unit tests (unit)
- The recorded `lines` cut changes to the line form: update the `lines` entry of `contract/testdata/cut_bytes.json` checked by `TestCutRecordedBytes` (integration)
- Fitting text is verbatim and cutting is idempotent: existing `TestSharedDeliveryPreservesFittingTextAndBoundsOversizedTextHonestly` and `checkDelivery` (existing)
- Typed image output passes `Output.Cut()` unchanged: existing `TestCutOfAnOutputPassesTypedPartsUnchanged` (existing)
- The shell envelope stays valid JSON within 16384 bytes with the line marker in its cut output: existing `TestShellYieldLargeJSON` and `TestShellYieldLargeMalformedOutput`, plus acceptance outline "The shell envelope near the bound stays valid JSON" (scenario)
- The documented cut describes the three marker forms: update the "Tool result cut (fixed)" paragraph of `docs/contract/loop-v1.md` (existing)

## Feasibility
- A scratch implementation of the Rule in a copy of this checkout outside the repository produced exactly the bytes of the step file's JS reference for 48 fixtures (plain, numbered, single-line, status-plus-long-line and escaping text at 0, 16383, 16384, 16385, 16400, 20000, 40000, 99999 and 1000000 bytes, a 1200-line `read_file` text, numbered text with a final newline, numbered text starting at 99990 and a one-line omission); with it the acceptance feature passed 25 of 25 scenarios, and on the unchanged tree 13 scenarios fail (the line, range and envelope ones) while the byte-only, fitting and idempotence scenarios pass. With that implementation `go test ./...` failed only `TestCutRecordedBytes` (`lines` recording), `TestCutLineAligned` and `TestSharedDeliveryPreservesFittingTextAndBoundsOversizedTextHonestly` (byte-only marker regex), the tests listed for update above. These runs were made in this external session and are not Kogen probe records.
- evidence: {"id":"cut-marker-observer","kind":"observer","inputs":["features/steps/l_cut_marker_lines.js"],"observers":["features/steps/l_cut_marker_lines.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/l_cut_marker_lines.js good","exit":0,"output":"observer good\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/l_cut_marker_lines.js bad","exit":1,"output":"observer bad rejected\n"}]}
