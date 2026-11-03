# Give read_file a binary notice for non-text files

Slug: read-file-binary-notice
Model: not applicable — read_file's result depends only on the bytes of one file read and the call's arguments; there is no state between calls
Acceptance:
- .kogen/intents/read-file-binary-notice/acceptance.feature
- features/steps/read_file_binary_notice.js
- features/steps/read_file_binary_notice_driver.go

Today `read_file` (`tools.(*Tools).readFile` in `tools/tools.go`) gives every file it reads to `numbered`. A file that contains NUL bytes or bytes that are not valid UTF-8 comes back as numbered lines that hold NULs and, once `Cut` has normalised it, U+FFFD replacement characters. Nothing says the file is binary. The model can then reason about that garbage, copy it or "edit" it, and a later `write_file` of that content silently corrupts the file.

After this change, a successful read whose bytes contain a NUL byte (0x00) or are not valid UTF-8 (Go `utf8.Valid` is false) returns exactly one line of text and no numbered content:

`<path>: binary file, <N> bytes (contains a NUL byte or is not valid UTF-8); content not shown`

- `<path>` is the `path` argument exactly as the call gave it, the same way the existing `error: <path> does not exist` text uses it.
- `<N>` is the decimal number of bytes in the whole file that was read.

The result is a normal, non-error text result: `Classified.ErrorKind` and `Classified.MalformedClass` are `""`, the output is text (not typed parts), and `Tools.Run` / `RunClassified` return a nil Go error. The check covers the whole content of the file, whatever `start_line` and `end_line` say, so with those arguments a binary file still gets the same notice. The notice is far below 16384 bytes, so `Output.Cut` passes it through unchanged.

Things that stay exactly as they are today:
- Every file whose content is valid UTF-8 with no NUL byte: CRLF line endings, no final newline, multi-byte characters, an empty file (result `""`), and `start_line`/`end_line` ranges all go through `numbered`.
- The 16384-byte bound, the 4096-byte head and the line-aligned cut in `Cut`/`cutText`.
- Refusal and error texts and their kinds (`outside_root`, `not_found`, `is_folder`, `file_error`).
- `view_image` and its typed parts.
- The workspace snapshot, which already lists binary and invalid-UTF-8 files without reading them.
- The model-facing `read_file` definition in `tools/defs.go`, which is pinned as the exact Kogen text.

The only output that changes is that of `read_file` on a binary file: it was numbered text and becomes the notice. Update the `read_file` description in `docs/contract/loop-v1.md` (the caller contract) to state the binary notice and that it is not an error kind. Add no option, setting, error kind, event or `api` constant. Do not touch CHANGELOG.md, publish anything, or change Kogen's vendored copy or pin.

## Decisions
- A file is binary when its bytes contain a NUL byte or are not valid UTF-8, judged on the whole file content. One NUL anywhere is enough, including one after 20000 bytes of text, so no prefix heuristic is used. (source: request)
- The binary result is a normal non-error text result, not a classified tool error. The request leaves this to whichever the existing error classes support and asks for the choice to be stated here. The existing error kinds describe file-system failures (`file_error` is "any other file-system failure"), and reading a binary file succeeds, so no existing class fits and no new class is added. (source: request)
- The notice says plainly that the file is binary and gives its size in bytes, and the bytes are not returned as numbered text. Its exact text is `<path>: binary file, <N> bytes (contains a NUL byte or is not valid UTF-8); content not shown`, for example `blob.bin: binary file, 6 bytes (contains a NUL byte or is not valid UTF-8); content not shown`. (source: request)
- `start_line`/`end_line` do not change the result for a binary file: it gets the same notice with the whole file's byte count. For a text file they behave as today. (source: request)
- An image file keeps its existing image path: `view_image` of a valid PNG still returns typed parts `input_text`, `input_image`. `read_file` of the same PNG gets the binary notice like any other binary file. (source: request)

## Source comparison
- Addressed, request "Need" (notice for NUL or invalid UTF-8, size in bytes, no numbered bytes): `readFile` in `tools/tools.go` and acceptance scenarios "a binary file is named as binary with its byte count" (NUL plus invalid UTF-8, NUL only, invalid UTF-8 only) and "a NUL byte after 20000 bytes of text still makes the file binary".
- Addressed, synthetic acceptance 1 (`a`, NUL, `b`, 0xFF, 0xFE, `c`): Outline example `blob.bin` with hex `610062fffe63`. It expects the exact notice with 6 bytes and no NUL or U+FFFD.
- Addressed, synthetic acceptance 2 (CRLF, no final newline): scenario "a CRLF text file without a final newline is numbered as today" expects `1\tone\r\n2\ttwo\r\n3\tthree`.
- Addressed, synthetic acceptance 3 (accents, CJK): scenario "a valid multi-byte UTF-8 file is numbered as today" expects the exact numbered text, including a 4-byte emoji.
- Addressed, synthetic acceptance 4 (40000 zero bytes): scenario expects exactly `zeros.bin: binary file, 40000 bytes (contains a NUL byte or is not valid UTF-8); content not shown`, not a cut blob.
- Addressed, synthetic acceptance 5 (empty file): scenario expects the non-error result `""`, as today.
- Addressed, synthetic acceptance 6 (`start_line`/`end_line`): binary scenario with `start_line` 1 and `end_line` 1 expects the notice. Text scenario expects `2\ttwo\n3\tthree`, `3\tthree\n4\tfour` and `1\tone` for the ranges 2–3, from 3 and to 1.
- Addressed, "typed image file keeps its existing image path": PNG scenario, `view_image` typed parts and the `read_file` notice with 72 bytes.
- Addressed, "The 16 KiB bound and the cut behaviour are unchanged": scenario "a long text file is still cut to the 16 KiB bound" (2000 numbered lines, at most 16384 bytes, the omission marker, complete first lines and the final line 2000). The existing `Cut` tests remain.
- Addressed, "normal (non-error) text result or a classified tool error … stated in the intent": decided as a non-error text result (see Decisions). Every scenario checks `error_kind` and `malformed_class` are empty and the result is not typed.
- Omitted: nothing that was requested. Not changed: the snapshot (it already excludes binary files) and the pinned tool definition text.

## Tests
- A file with a NUL byte, with invalid UTF-8, or with both, including a NUL after 20000 text bytes, gets the exact notice with the whole file's byte count as a non-error text result: add a temp-dir test in `tools` (for example `TestReadFileNamesBinaryFiles`) through `Tools.Run`/`Call` with the `blob.bin` (`a\x00b\xff\xfec`, 6 bytes), NUL-only, Latin-1 and 40000-zero-byte fixtures, asserting the text, `ErrorKind` and `MalformedClass` (integration)
- `start_line`/`end_line` on a binary file still give the notice: same test, with a call that passes `start_line` and `end_line` (integration)
- Valid UTF-8 text (CRLF without final newline, multi-byte, empty, ranges) is numbered as today: keep `TestToolsReadFileNumbersLines` and `TestCallRunsTheDecodedFunctionCall`, and add CRLF, multi-byte and empty-file cases to the new tools test (integration)
- 16 KiB bound and cut behaviour unchanged: the existing `Cut` and line-cut tests stay as they are (existing)
- `view_image` typed path unchanged: the existing `tools/image_test.go` tests stay as they are (existing)
- End to end, as the loop delivers it (`Tools.CallClassified` then `Output.Cut`): `acceptance.feature` through `features/steps/read_file_binary_notice_driver.go` (scenario)

## Feasibility
- No external protocol, provider or library facts are involved: the check uses Go standard library `bytes`/`slices` and `unicode/utf8.Valid`, which `tools/snapshot.go` already uses for the same NUL and UTF-8 test. No documentation lookup was needed.
- Scratch copy of HEAD 3b63d9f, outside the checkout: on the unchanged tree the acceptance gave 12 scenarios, 5 passed (CRLF, multi-byte, empty, text ranges, 16 KiB cut) and 7 failed. The 7 are the binary outlines, zeros, late NUL, binary range and PNG `read_file`; each returned numbered bytes such as `1\ta\x00b��c`, and the PNG's `view_image` step passed. With a trial two-line `readFile` change (not submitted), all 12 scenarios passed, and `go test ./tools ./contract ./conformance` passed with `gofmt -l .` clean.
- evidence: {"id":"binary-notice-observer","kind":"observer","inputs":["features/steps/read_file_binary_notice.js","features/steps/read_file_binary_notice_driver.go"],"observers":["features/steps/read_file_binary_notice.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/read_file_binary_notice.js good","exit":0,"output":"observer good\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/read_file_binary_notice.js bad","exit":1,"output":"observer bad rejected\n"}]}
