# Name the bad value in task refusals

Slug: kogen-loop-task-refusals-name-the-bad-value
Model: not applicable — the change is the text of stateless validation refusals
Acceptance:
- .kogen/intents/kogen-loop-task-refusals-name-the-bad-value/acceptance.feature
- features/steps/kogen-loop-task-refusals-name-the-bad-value__refusals.js
- features/steps/kogen-loop-task-refusals-name-the-bad-value__driver/main.go

When a task names a provider, a tool or a terminal tool that cannot be used, the `invalid_task` refusal (class `loop`, exit code 2, `session.ended` status `failed`, raised before any request and before `session.started`) now says which value is wrong and what is accepted. Only the `detail` changes, for both `kogen-loop run` (`validateTask` in cmd/kogen-loop/main.go, where `provider.Lookup(t.Role.Provider)` failing gives the provider refusal) and `loop.NewSession`/`loop.ResumeSession` (`build` in loop/session.go, where `tools.Definition(name)` failing gives the tool refusal and `seen` holds the enabled tools and the terminal names seen so far).

The details are:
1. Unknown provider: `unknown provider nobody; the providers are chatgpt, supergrok, opencode-go, anthropic, openai-compatible` (the offending name, then the catalog names in catalog order, separated by a comma and a space).
2. Empty provider (`Role.Provider` empty): `role.provider is required; the providers are chatgpt, supergrok, opencode-go, anthropic, openai-compatible`.
3. Unknown tool: `unknown tool teleport; the tools are read_file, write_file, list_files, search_text, shell, view_image, documentation`. The tools are exactly what `tools.Definition` (the `Definition` function of tools/defs.go) accepts and what `genericTools` in cmd/kogen-loop/main.go lists.
4. Terminal names: a name equal to an enabled tool gives `terminal tool shell is also an enabled tool`; an empty name gives `a terminal tool name must not be empty`; a repeated name gives `duplicate terminal tool finish`.

The accepted names come from `provider.Catalog` and the tool-name constants of package tools, not from a second hand-kept list in the refusal text. The old texts (`"detail":"unknown provider nobody"` for an unknown provider, `"detail":"unknown provider "` with a trailing space for an empty one, `"detail":"unknown tool teleport"`, and the single shared terminal sentence) are removed.

Nothing else changes: `duplicate tool`, `root is required`, every other `validateTask` detail, `session_mismatch` refusals, the package provider texts (`unknown provider nobody` there stays), the default tools and default terminal name. No new option, field or configuration.

## Decisions
- Provider names in the refusal come from a new provider.Names() that walks provider.Catalog(); tool names from a new tools.Names() that lists the tool-name constants in order; both the CLI validateTask and loop build use them, with no other list in the refusal text. (decision: D1, round 1) (constraint: provider/refused and provider/login_failed texts in package provider stay unchanged) (evidence: provider/provider.go; tools/defs.go; cmd/kogen-loop/main.go; loop/session.go) (source: request)
- A terminal-name fault is checked per name in the order empty, repeated terminal name, enabled-tool clash, each with its own sentence. (decision: D2, round 1) (evidence: loop/session.go) (source: request)
- Acceptance runs the built CLI and a small Go driver calling loop.NewSession; it does not depend on Go tests the Build must write. (decision: D3, round 1) (evidence: conformance/harness_test.go; cmd/kogen-loop/main.go) (source: request)

## Source comparison
- Addressed: request Expected 1-4 map to the CLI and library scenarios in acceptance.feature with the exact detail texts, class, reason, exit 2, failed ending and no session.started.
- Addressed: the request's observed old behavior is superseded: `"detail":"unknown provider nobody"`, `"detail":"unknown provider "` and `"detail":"unknown tool teleport"`, and `terminal` of `["shell"]`, `[""]` or `["finish","finish"]` sharing one sentence. The tools of the unknown-tool case are `["read_file","teleport"]`.
- Addressed: wrong implementations the request names are rejected by controls: alphabetical provider order, a dropped offending name, `unknown provider ; the providers are chatgpt, supergrok, opencode-go, anthropic, openai-compatible` for an empty provider, only five tools listed, one terminal sentence such as `terminal tool shell is not allowed`, and a library that keeps the old text.
- Addressed: the CLI provider check (`validateTask`) and the library check (`build`) must give the same detail; both are exercised.
- Build instructions for Go tests: process tests go in conformance/process_test.go next to `TestInvalidTaskFields`, using `newWorld`, `signIn`, `newFakeProvider`, `runCLI` and `w.task(over)` and reading `r.first("error")["detail"]`; the library test goes next to `TestSessionDefaultsAreTheGenericTools`, using `sessionConfig` and changing `Role.Provider`, reading the detail with `sys.AsError(err)`.
- Not executable here: the 'fake provider received no request' check is covered by the Go process tests the Build adds; acceptance points the CLI at an unreachable provider URL and observes the refusal events.

## Tests
- Unknown provider lists the providers (CLI): TestUnknownProviderRefusalListsTheProviders in conformance/process_test.go next to TestInvalidTaskFields, also checking exit 2 and that the fake provider received no request (integration)
- Missing provider says it is required: TestMissingProviderRefusalSaysItIsRequired in conformance/process_test.go (integration)
- Unknown tool lists the tools: TestUnknownToolRefusalListsTheTools in conformance/process_test.go (integration)
- Terminal faults are told apart: TestTerminalNameRefusalsNameTheFault in conformance/process_test.go with terminal ["shell"], [""] and ["finish","finish"] (integration)
- Library refusal lists the providers: TestNewSessionRefusalListsTheProviders in conformance/library_test.go next to TestSessionDefaultsAreTheGenericTools, using sessionConfig and sys.AsError (integration)
- Whole behavior through the built CLI and loop.NewSession: the acceptance scenarios (scenario)
- Existing refusal classes, provider texts and contract/provider_test.go stay green: existing tests under go test ./... (existing)

## Feasibility
- none
