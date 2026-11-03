# Report unusable read_file line ranges

Slug: read-file-line-range-feedback
Model: not applicable — each read_file call is a stateless check of its own arguments and file text; nothing persists between calls
Acceptance:
- .kogen/intents/read-file-line-range-feedback/acceptance.feature
- features/steps/read_file_line_range.js
- features/steps/read_file_line_range_driver.go

`read_file` (`tools/tools.go`, `readFile` and `numbered`) gets a short, stable message whenever a requested line range returns nothing or cannot be understood. Today those cases return an empty string, quietly ignore the argument, or blame `path`.

These stay unchanged:
- A valid range that returns lines stays byte for byte the same: `<n>\t<line>` lines joined by `\n`, a final newline ending the last line, and the 16384-byte cut applied on delivery (`Output.Cut`).
- No range at all: an empty file still returns `""`.
- `start_line` of 0 or below still reads from line 1.
- `end_line` past the last line still reads to the last line.
- Integers beyond int64 are still clamped as today.
- The path checks and their texts and classes, and the file errors (`not_found`, `is_folder`, `outside_root`, `file_error`).
- The model-facing `read_file` definition text in `tools/defs.go`.

No option, setting, event or API constant is added.

The new behavior, checked in this order after the existing `path` string check:

1. `start_line`, when present. A JSON integer is accepted; an integer beyond int64 is clamped as today. A number too large in magnitude to represent as a float64 (for example `1e999` or `-1e999`) returns `error: argument start_line is a number too large to represent`. Any other value returns `error: argument start_line must be an integer`: a string such as `"2"`, a number written with a fraction or an exponent (such as `2.5`, `2.0` or `1e2`), `null`, a boolean, an array or an object. Both are malformed calls with class `wrong_argument_type`.
2. `end_line`, when present: the same two messages, naming `end_line`, also with class `wrong_argument_type`.
3. The effective start S is `start_line` when it is an integer of at least 1, and 1 otherwise (absent, 0 or negative, as today). When `end_line` is present and smaller than S, the call returns `error: end_line <end_line> is before start_line <S>` with class `conflicting_arguments`. Both numbers are decimal int64 values after clamping. Example: `start_line 3, end_line 1` gives `error: end_line 1 is before start_line 3`. `end_line` equal to S still returns that one line.
4. The file is read. Its errors are unchanged and come before rule 5.
5. Let N be the file's line count, counted the way `numbered` counts lines: the final newline ends the last line, and an empty file has 0 lines. When `start_line` is present and S is greater than N, the call returns the notice `(start_line <S> is past the end of <path>; line count: <N>)`, where `<path>` is the `path` argument exactly as given. The notice has no error kind and no malformed class, like `(no matches)`. Examples: `start_line 99` on the 3-line `a.txt` gives `(start_line 99 is past the end of a.txt; line count: 3)`, and `start_line 1` on an empty file gives `(start_line 1 is past the end of e.txt; line count: 0)`. Without `start_line`, an empty file still returns `""`.
6. Otherwise the output is the existing numbered lines, unchanged.

Decoding change needed for rule 1's too-large number. Today `tools.DecodeArguments` (`tools/conversation.go`) turns an arguments object that holds a number overflowing float64 into `{"__invalid__": true}`. That is why `start_line 1e999` currently reports `error: argument path must be a string`. After this change, `DecodeArguments` keeps such an object: that member becomes `json.Number` holding its literal text (for example `json.Number("1e999")`), and every other member decodes as before. These still decode to `{"__invalid__": true}`: anything that is not a JSON object, invalid JSON, trailing data, invalid UTF-8 and unpaired surrogates. The `contract/` `tools-invalid-arguments` item is therefore unaffected. The package-internal `decodeJSON` still refuses out-of-range numbers for its other callers (image metadata, `writeJSON`'s re-decode; covered by `TestDecodeAcceptsAndRefusesWhatErlangsJSONDoes`), and so does the `provider` package's own decoder. As a consequence, another tool whose arguments object also holds such a number is no longer told that its required argument is missing. It treats the value like any other value of an unexpected type. This adds no new behavior to those tools.

Update `docs/contract/loop-v1.md`:
- In the malformed-class table, `wrong_argument_type` also covers a `read_file` `start_line` or `end_line` that is not a JSON integer or is too large to represent.
- In the same table, `conflicting_arguments` also covers a `read_file` `end_line` before its effective start.
- State that `read_file` checks `path`, then `start_line`, then `end_line`.
- Add one short paragraph giving the range messages and the past-the-end notice above.

Do not add a CHANGELOG.md entry and do not modify Kogen, its vendored copy or its pin.

## Decisions
- Successful outputs stay as they are. A valid range that returns lines is unchanged byte for byte, including the line-number format and the cut. (source: request)
- A start past the end returns a message stating the file's line count, and an empty file with no range still returns the empty result. (source: request)
- A range argument that is not an integer returns a message naming that argument instead of the whole file. Both a string (`"2"`) and a decimal (`2.5`) are rejected. (source: request)
- An end before the start returns a message saying so. (source: request)
- An unrepresentable number such as `1e999` returns a message naming the range argument, not `path`. (source: request)
- Messages follow the tool's existing styles. Rejected arguments use `error: argument <name> ...`, like `error: argument path must be a string`. The past-the-end result is a parenthesized notice like `(no matches)`, because the call is well formed and only finds no lines. The exact literals are the ones in the rules above. (source: request)

## Source comparison
- Addressed, request problem 1 / acceptance 1 (start past the end): rule 5 gives the notice with `line count: 3` for `a.txt`, and the empty `e.txt` result is unchanged. Scenarios "A start past the end states the file's line count" and "An empty file without a range still reads as the empty result".
- Addressed, request problem 2 / acceptance 2 (`start_line "2"` and `end_line 2.5`): rules 1–2 name the argument with `wrong_argument_type`, and acceptance asserts the exact message instead of the whole file. Other non-integer values (`null`, `2.0`, booleans and so on) follow the request's "any value that is not an integer" under the same rule.
- Addressed, request problem 3 / acceptance 3 (`start_line 3, end_line 1`): rule 3 returns `error: end_line 1 is before start_line 3` with `conflicting_arguments`.
- Addressed, request problem 4 / acceptance 4 (`start_line 1e999`): the `DecodeArguments` change plus rule 1 return `error: argument start_line is a number too large to represent`, tested through the real `Call` decoding path.
- Addressed, request need / acceptance 5: `start_line 2`, `end_line 2` and `start_line 2 end_line 3` return exactly today's `2\ttwo\n3\tthree`, `1\tone\n2\ttwo` and `2\ttwo\n3\tthree` (observed on the unchanged tree). The unchanged cut stays covered by existing tests.
- Required by the project contract (`docs/contract/loop-v1.md`, tool error kinds): every `error: ` result carries exactly one class. Hence the `wrong_argument_type` and `conflicting_arguments` classes and the class-free notice.
- Superseded existing behavior:
  - dropping an unusable range argument and reading the whole file;
  - returning one line when the end is before the start;
  - returning `""` for a start past the end;
  - `DecodeArguments` treating an object with an out-of-range number as `__invalid__` (the `{"a":1e999}` entry of `TestDecodeArgumentsIsAnObjectOrTheInvalidMarker`).
- Omitted: none of the requested behavior.

## Tests
- Start past the end gives the notice with the line count; `start_line` equal to the line count still returns the last line; `start_line 1` on an empty file gives `line count: 0`; an empty file with no range returns `""`: add focused read_file tests in `tools` (unit)
- A `start_line` or `end_line` that is not a JSON integer (`"2"`, `2.5`, `2.0`, `null`) is named with `wrong_argument_type`, and `start_line` is checked before `end_line`: add focused read_file tests in `tools` (unit)
- `end_line` smaller than the effective start gives `error: end_line 1 is before start_line 3` with `conflicting_arguments`; `end_line` equal to the start returns that one line: add focused read_file tests in `tools` (unit)
- `start_line 1e999` through `Tools.Call` names `start_line`, not `path`; `DecodeArguments` keeps `{"a":1e999}` as an object holding `json.Number("1e999")`, while non-objects stay `__invalid__`: update `TestDecodeArgumentsIsAnObjectOrTheInvalidMarker` and add a `Call` test with raw arguments (regression)
- The reported cases and the unchanged ranges through the real call path (raw JSON arguments → `DecodeArguments` → `CallClassified`): acceptance scenarios through `features/steps/read_file_line_range_driver.go` (integration)
- Valid ranges, the line-number format and the 16384-byte cut are unchanged: keep the range cases in `tools/read_contain_test.go`, `contract/tools_test.go` and `tools/cut_output_test.go` passing unchanged (existing)

## Feasibility
- No external protocol, provider or library facts are involved, so no documentation lookup was needed. I ran the driver in a scratch copy of HEAD, outside the checkout, on the unchanged tree. Observed today:
  - `start_line 99` → `""`, and `e.txt` → `""`;
  - `start_line "2"` and `end_line 2.5` → the whole file `1\tone\n2\ttwo\n3\tthree`;
  - `start_line 3, end_line 1` → `3\tthree`;
  - `start_line 1e999` → `error: argument path must be a string`, class `missing_argument`;
  - the three unchanged ranges match the expectations above.
- On that tree, acceptance ran 9 scenarios: 4 passed and 5 failed on their first Then step. A throwaway scratch prototype of the rules above made all 9 pass. The driver is `gofmt` clean.
- evidence: {"id":"read-file-range-observer","kind":"observer","inputs":["features/steps/read_file_line_range.js","features/steps/read_file_line_range_driver.go"],"observers":["features/steps/read_file_line_range.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/read_file_line_range.js good","exit":0,"output":"observer good\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/read_file_line_range.js bad","exit":1,"output":"observer bad rejected\n"}]}
