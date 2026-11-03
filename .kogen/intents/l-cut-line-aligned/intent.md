# Align tool text cuts with complete lines

Slug: l-cut-line-aligned
Model: not applicable — deterministic stateless text transformation
Acceptance:
- .kogen/intents/l-cut-line-aligned/acceptance.feature
- features/steps/l_line_cut.js
- features/steps/l_line_cut_driver.go

Replace raw-byte end selection in tools.Cut and its shared cutText path with line-aware selection. Retain the 16384-byte total bound, including the existing marker `\n[... N bytes omitted ...]\n`, and the 4096-byte head budget. Select the last complete newline-terminated head line within that budget; if none fits, retain the existing UTF-8-safe byte prefix. Select a suffix beginning just after a newline within the suffix budget; if no such boundary fits, retain the existing UTF-8-safe byte suffix. Do not expand either budget to complete a long line. Continue conservative marker-width reservation; unused space is allowed. Compute N from the original normalized text length minus the actual retained head and tail bytes, after line adjustment. Keep UTF-8 normalization and typed image behavior unchanged.

The shell's JSON-escaped output uses cutText with smaller bounds and head budgets; apply the same rule relative to those budgets without breaking valid JSON or the 16384-byte envelope bound. Keep the envelope intact, cutting only its output. Do not change public interfaces, introduce settings, update CHANGELOG.md, publish, install, or change downstream Kogen pins.

## Decisions
- Complete retained numbered lines must keep their numbers, rather than expose fragments on either side of the marker. (source: request)
- A line longer than the available end budget falls back to byte cutting at UTF-8 boundaries. Valid fitting text stays unchanged and repeated Cut calls are identical. (source: request)

## Source comparison
- Addressed: request L-CUT-LINE-ALIGNED problem and need by replacing tools/tools.go:818-826 raw offsets with the line-selection contract above; bounds, normalization and existing marker format remain.
- Addressed: synthetic cases 1 and 2 by the lines fixture (500 lines of 80 bytes, 40000 total) and numbered fixture (`<n>\t<line>`) with exact prefix/suffix and boundary assertions in acceptance.feature and l_line_cut.js.
- Addressed: synthetic cases 3–5 by 30000-byte single-line and multibyte fixtures, fitting-size boundary examples, per-result idempotence, byte counts and UTF-8 preservation in the same executable acceptance.
- Addressed: synthetic case 6 by existing TestShellYieldLargeJSON through the shell envelope scenario; it exercises JSON-escaping expansion and checks JSON validity and bound through the actual tool.
- Omitted: none of the requested behavior. No scope conflict or supersession; source README/testing rules require focused implementation regressions and no CHANGELOG entry.

## Tests
- Complete head and tail lines, actual omitted count and numbered read_file-style retention: add focused Cut regressions using 40000 bytes of 80-byte lines and numbered lines (regression)
- Long-line fallback and multibyte character boundaries: add focused Cut tests for 30000 ASCII bytes and 30000 UTF-8 bytes (unit)
- Fitting text and idempotence: test 16383, 16384, 16385 bytes and repeat Cut for every fixture (unit)
- JSON-escaped shell output remains valid and bounded: preserve TestShellYieldLargeJSON (existing)

## Feasibility
- Existing shell regression command `go test ./tools -run '^TestShellYieldLargeJSON$' -count=1` passed, exit 0; observed summary `ok  \tkogen-loop/tools\t0.279s`. No external protocol or library change requires documentation research.
- evidence: {"id":"line-observer","kind":"observer","inputs":["features/steps/l_line_cut.js","features/steps/l_line_cut_driver.go"],"observers":["features/steps/l_line_cut.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/l_line_cut.js good","exit":0,"output":"observer good\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/l_line_cut.js bad","exit":1,"output":"observer bad rejected\n"}]}
