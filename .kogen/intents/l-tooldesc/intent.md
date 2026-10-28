# Add opt-in compact tool descriptions

Slug: l-tooldesc
Model: not applicable — description selection is a stateless transformation
Acceptance:
- .kogen/intents/l-tooldesc/acceptance.feature
- features/steps/l_tooldesc.js

Add `CompactDescriptions bool` to `tools.Tools`. False preserves full descriptions; true selects compact descriptions through `(*Tools).Definition(name)`. Package `Definition` and `Defs` remain full and unchanged. Preserve all seven generic tools and every non-description value exactly; retain description keys. Add `tools/testdata/defs_compact_golden.json` beside `defs_golden.json`, containing the seven generic definitions keyed by name. Never change the existing golden file, which also contains host workflow tools outside this library.

Measure bytes using `encoding/json.Marshal` on identical ordered seven-element definition arrays in full and compact modes with zero ShellTimeout. Require `100 * len(compact) <= 70 * len(full)`. Compare canonical JSON bytes of default definitions with corresponding existing golden entries. The formatted whole golden contains additional host tools and is not itself a returned definition array; preserve its literal bytes, and preserve default definition bytes under the same serialization.

Compact text must stay useful and truthful, including image constraints, repository-relative paths, search syntax, documentation origin restriction and shell execution/custody. Positive ShellTimeout must appear truthfully in compact shell text with configured duration and group teardown before timeout feedback. Do not mutate definitions previously returned or definitions from another instance. Tool execution is unchanged. Document the option and a Go example in `docs/contract/loop-v1.md`: build definitions with the configured instance and pass that instance to Round.Tools. Add no CLI flag, task setting, provider change or runtime switching.

Implement ordinary implementation-owned `TestLTooldescCompact` in tools using public Definition, Tools and Run interfaces, with the cases below. Acceptance requires that exact named test actually run and pass. Review the documentation output as well.

## Decisions
- Library-only opt-in compact descriptions; defaults and behavior unchanged; no CLI. (source: request)
- Preserve every tool, parameter name, type, required flag and enum; shorten description strings only. (source: request)
- Add compact golden adjacent to existing golden and document in docs/contract. (source: request)
- Research metric remains request bytes and uncached first-request tokens with no change in tool-call errors. This delivery proves definition byte reduction, not live token savings or measured error rates; no paid calls or new benchmark subsystem. (source: request)
- Shared-host scratch work uses temp dirs only, no synthetic CPU load, no stopping processes by name/pattern, only pids started by this work. (source: request)

## Source comparison
- Addressed: request L-TOOLDESC option, schema preservation and 30% reduction are specified above and covered by TestLTooldescCompact through acceptance.
- Addressed: existing defs_golden.json stays byte-identical; tools/defs_test.go currently checks parsed generic entries. Canonical byte comparison supplements it without claiming host workflow definitions are library tools.
- Conflicting: equality of an entire formatted golden object with a returned list is not an existing interface. The complete contract preserves the literal file and compares canonical generic entries instead; no default text or schema changes are authorized.
- Addressed: compact golden and docs/contract have exact paths above. Unchanged behavior, no CLI and configured checks are retained below.
- Addressed: research seed 28 Oct 2026 and rationale (definitions in each request prefix) motivate byte savings; the metric is retained without claiming an unperformed provider experiment.
- Addressed: host safety is retained in Decisions. No reproducing examples or counterexamples were supplied.
- Omitted: no requested feature is omitted; host workflow tools, Kogen vendoring, publishing and external benchmarking are outside scope.

## Tests
- Defaults remain identical: TestLTooldescCompact compares package and false/zero instance definitions to canonical existing golden entries (unit)
- Compact preserves schema and saves at least 30%: TestLTooldescCompact recursively strips descriptions and compares JSON values with meaningful array order, compares compact golden, preserves description keys and asserts the integer byte inequality (unit)
- Selection composes with timeout without mutation: TestLTooldescCompact covers compact on/off with zero and positive ShellTimeout, subsequent calls and separate instances (unit)
- Tool execution is unchanged: TestLTooldescCompact compares full/compact read_file execution on one temporary file, retaining existing tools and shell custody tests (integration)
- Configured checks pass: retain and run go-format, go-test, go-vet and go-build from .kogen/project.yaml (existing)

## Feasibility
- Focused scratch command `go test -json -count=1 -timeout=120s ./tools -run '^TestLTooldescCompact$'` confirmed Go availability but reported no tests to run. Acceptance rejects that empty success; the required test is absent. (probe 1: exit 0, 1.1 s)
