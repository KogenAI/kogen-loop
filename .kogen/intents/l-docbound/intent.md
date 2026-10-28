# Expose documentation byte bounds

Slug: l-docbound
Model: not applicable — configuration validation and bounded transformation have no meaningful state
Acceptance:
- .kogen/intents/l-docbound/acceptance.feature
- features/steps/l_docbound.js

Expose Documentation.ResultBound and Documentation.BodyBound as Go int byte options. Resolve zero independently to 16384 and 8388608 respectively. Add Documentation.Validate() error and have Tools.Validate (and therefore tools.New) validate the nested Documentation options. Keep zero-value and direct struct usage compatible; configured callers must validate before Lookup. No CLI/task settings, timeout change, external research service changes, or Kogen pin changes are included.

## Decisions
- Keep defaults byte-identical for results, definitions and replay; preserve origin pinning, redirects, headers, statuses, decoding and fetch behaviour apart from the configured read ceiling. Tests use only local fake origins. (source: request)
- Keep the existing Timeout field and its 20-second default unchanged. (source: request)
- Result fitting must use the configured result bound and existing body-halving/last-source-first shrinking order, preserving the untrusted marker. (source: request)
- Use a small sane minimum of 1024 bytes for both resolved bounds; reject negatives, either resolved bound below 1024, and resolved result greater than resolved body. Equality is valid. Validation returns a nonnil error identifying the invalid option; New returns nil plus that error. (source: request)

The bound applies to the encoded JSON, not rune count or body length. Preserve default docFit output exactly. Configured fitting must also bound long query/URL/operation metadata: after the existing shrinking strategy is exhausted, trim metadata UTF-8-safely as needed to fit while retaining result keys, status, error and marker. This fallback must not change zero/default output. BodyBound retains the existing LimitReader prefix semantics, not a new oversize error. Document units, defaults, minimum, zero resolution, validation and direct usage under docs/contract.

## Source comparison
- Addressed: request L-DOCBOUND options and acceptance correspond to the public fields, validation and four executable cases below; 8192, 16384, 8388608 and the unchanged 20 s are retained explicitly. The unspecified small sane minimum is settled technically at 1024.
- Addressed: request Must stay corresponds to default byte snapshots and unchanged existing documentation/definition/replay tests; source tools/documentation.go currently fixes both bounds and tools.New already validates Tools.
- Addressed: request Host safety applies to every test and command: temp directories only, no public network, no synthetic load, no process-name/pattern stops, only owned pids.
- Superseded: fixed docFit/read ceilings in tools/documentation.go become resolved instance limits; timeout and transport behaviour are not superseded.
- Omitted deliberately: research measurements, catalogue edits, global installation, vendor synchronization and timeout options are not requested deliverables. The provisional shelf-floor history is context, not authorization for other work.

## Tests
- Zero options preserve current bytes: add TestLDocboundDefaults comparing fake-origin Lookup against pre-change expected serialized output for search, fetch, hostile and truncated responses, and explicit-default options against zero options; retain definition/replay coverage (integration)
- Configured result fitting: add TestLDocboundResultBound using tools.New and Tools.Run with a local fake origin, 8192-byte bound, valid JSON, UTF-8 and hostile marker preservation, body-halving and ordered source-prefix retention; cover encoded size at the bound and adjacent sizes, including oversized metadata (integration)
- Configured body ceiling: add TestLDocboundBodyBound verifying exact prefix reads for lengths limit-1, limit and limit+1, with BodyBound=8192 and ResultBound=8192, distinguishing read truncation from result fitting using short fake search JSON followed by padding and a later source beyond the read ceiling (integration)
- Invalid options are refused at construction: add TestLDocboundValidation table for negatives, 1023, 1024, 1025, result/body equality, result one greater than body, independent zero defaults and valid 8192; check Documentation.Validate and tools.New error/nil outcomes (unit)
- Existing fetch semantics, definitions, replay and configured checks remain unchanged: run existing tests plus go-format, go-test, go-vet and go-build from .kogen/project.yaml (existing)

Implementation owns these named Go tests under tools/, not protected acceptance files. Expected outcomes in acceptance are obligations, not permission to replace behaviour with test-name stubs. Capture default expected bytes from the original implementation before changing it, normalizing only the dynamically allocated fake-origin URL consistently on both sides.

## Feasibility
- The local Go test command works; the proposed default test is absent (exit 0 with no tests to run), so acceptance must require a named run/pass event, not just process success. (probe 1: exit 0, 1.2 s)
