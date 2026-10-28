# Add an opt-out for parallel tool calls

Slug: l-parallel
Model: not applicable — this is request configuration and propagation, not a new state machine; batch execution remains unchanged
Acceptance:
- .kogen/intents/l-parallel/acceptance.feature
- features/steps/l_parallel.js

Add a Go-library loop/provider research knob for default versus off. Add `DisableParallelToolCalls bool` to `loop.Round`, `loop.Request` and `provider.Request`. Propagate it through Run, Direct and FailOverBudget so measurement and transmission use the same body. False (including omission) retains today's exact request bytes on every route. True renders Responses `parallel_tool_calls: false`, or Messages `tool_choice.disable_parallel_tool_use: true`, preserving the existing choice type. With no tools, Responses still carries false; Messages need not create a tool_choice when there are no tools. Chat Completions routes refuse true before transport, with a clear error naming parallel tool calls and the unsupported route. Apply support according to the effective wire after profile resolution, not just the provider name. Do not silently retry without the control following a provider rejection.

This is library-only: no task JSON or CLI flag is added. Update docs/contract/loop-v1.md with the public fields, default, supported effective wires, unsupported refusal and unchanged batch semantics. Keep existing goldens unchanged and add configuration-specific tests rather than regenerating default goldens. No change to batch iteration, calls after a terminal call, replay, usage, cache placement, retries or credentials. This provides the research mechanism for requests per build and build wall time; it does not conduct a benchmark or claim an improvement. The seed-3 MECHANISMS `tool-parallel-calls` reference and provisional start by main are motivation, not additional implementation scope.

## Decisions
- Preserve provider defaults unless explicitly disabled; refuse unsupported routes clearly. (source: request)
- Continue executing every call returned in a batch even when disabling provider parallel generation. (source: request)
- Fake servers exist only in tests. Shared-host work uses private temporary directories, no synthetic CPU load, and never stops processes by name or pattern; only owned pids may be stopped. (source: request)

## Source comparison
- Addressed: request L-PARALLEL default/off behavior and exact wire literals are specified in the outcome above and exercised by the acceptance cases and named implementation tests below.
- Addressed: request default byte identity on every route, unchanged loop batching, docs/contract and all configured checks are retained explicitly; acceptance requires named tests actually to pass, not merely a successful empty go test selection.
- Addressed: README library conventions and testing rules are followed by standard-library Go tests and existing Cucumber infrastructure; no production fake transport or dependency is introduced.
- Omitted deliberately: no CLI/task surface, research execution, performance instrumentation, release, global install or Kogen consumer changes are required by this loop/provider option.
- Evidence limits: OpenAI documentation search returned generic sources; fetching https://platform.openai.com/docs/api-reference/responses/create returned unsupported. The Anthropic search returned irrelevant sources; fetching https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use returned truncated untrusted HTML, not usable protocol confirmation. The requested wire literals remain the contract; fake tests prove local request construction, not live model support. Remote rejection must remain an honest error.

## Tests
- Default requests remain byte-identical on every catalog and profile wire: add TestParallelToolCallsDefault using fixed identities and baseline encoded-body expectations, and retain existing goldens unchanged (unit)
- Responses off sends parallel_tool_calls false, including empty tools: add TestParallelToolCallsResponses with decoded assertions and a local HTTP capture through Client.Respond (integration)
- Messages off sends tool_choice.disable_parallel_tool_use true while preserving its existing type and omits unnecessary tool_choice without tools: add TestParallelToolCallsMessages with local HTTP capture through Client.Respond (integration)
- Unsupported effective Chat Completions routes refuse off without HTTP traffic: add TestParallelToolCallsUnsupported for opencode-go and openai-compatible, plus effective-wire profile routing where applicable (integration)
- Run forwards the option on successive requests, Direct transmits it and FailOverBudget measures the configured body: add TestParallelToolCallsLoop using real Run and Direct with a local test server, finite two-request exchange, and a measurement boundary that distinguishes configured versus default bytes (integration)
- Off does not truncate returned tool batches, including calls after a terminal call: add TestParallelToolCallsBatch with observable hook outputs and replay, preserving existing engine tests (regression)
- All configured formatting, test, vet and build checks pass: run unchanged .kogen/project.yaml checks (existing)

The implementation tests above are ordinary builder-owned Go tests, not protected fixtures. Their names are the executable acceptance interface; each must assert its specified behavior, not just emit a pass. Use existing provider and conformance response fixtures/helpers for valid replies and private test credentials. No live credentials or paid calls are needed.

## Feasibility
- A targeted local command `go test -json ./provider ./loop -run '^TestParallelToolCalls' -count=1` exited 0 in 1.9 s but reported no tests to run. Therefore acceptance explicitly requires named test pass events; a successful empty selection cannot pass. No generated protected transport fixture or lifecycle observer is introduced.
