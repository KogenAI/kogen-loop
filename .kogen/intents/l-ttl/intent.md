# Add optional Anthropic breakpoint TTL

Slug: l-ttl
Model: not applicable — per-request validation and rendering have no meaningful state transition
Acceptance:
- .kogen/intents/l-ttl/acceptance.feature
- features/steps/l_ttl.js

Implement L-TTL for research MECHANISMS `anthropic-cache-breakpoints` (provisionally started by main 28 Oct): an optional one-hour lifetime on Anthropic Messages cache breakpoints. Preserve default five-minute request bytes exactly. No paid provider calls or changes to non-Anthropic requests. This enables research, not measured savings.

## Decisions
- Expose `provider.Request.AnthropicCacheTTL string` as a Go provider-only per-request option, without CLI/task or loop extensions. Empty selects today's default; `1h` is the only accepted nonempty value on Anthropic Messages. Other values, including `5m`, are refused by Render and Respond before transport with provider/invalid_request and detail naming AnthropicCacheTTL. This is the recommended technical interface choice. (source: request)
- Default objects remain exactly `{"type":"ephemeral"}`. With `1h`, all provider-created breakpoints use `{"type":"ephemeral","ttl":"1h"}`: last tool when present, system[0], newest message's last eligible block, and the existing optional AuthorityBoundary marker. Preserve placement, limits, input immutability and raw native replay. Applying the TTL to the fourth marker avoids shorter-before-longer mixing. (source: request)
- Non-Anthropic routes ignore this Anthropic-specific option, even invalid nonempty values, preserving request bytes and diagnostics. (source: request)
- Anthropic attempt records report configured_ttl `1h` when selected and null when absent. Preserve applied_ttl as unknown/null; configuration is not evidence of observed retention. (source: request)
- Preserve existing headers including anthropic-version `2026-10-21`. Add no TTL beta header: current retrieved one-hour instructions prescribe ttl but no additional header. Do not guess a historical beta header. (source: request)
- Document the public option, defaults, validation, scope, diagnostics and header decision in docs/contract/loop-v1.md. Tests use fake servers and private temporary credentials only. On this shared host use temp directories for transient work, never stop processes by name/pattern, only stop owned pids, and never generate synthetic CPU load. (source: request)

## Source comparison
- Addressed: request Why/What/Acceptance → Decisions and all six acceptance rows. Preserve three original breakpoints; make the existing optional fourth authority marker consistent, without adding locations.
- Addressed: Must stay → default byte golden at the real HTTP boundary, non-Anthropic isolation, fake-only tests and unchanged configured checks.
- Addressed: diagnostics → configured_ttl `1h` for explicit selection, null for default; applied_ttl remains unknown, not an invented provider-confirmed lifetime.
- Addressed: Documentation note → https://platform.claude.com/docs/en/build-with-claude/prompt-caching.md fetched with find `1-hour cache duration`, status retrieved/untrusted. Both one-hour and Mixing different TTLs sections were read: ttl `1h`, longer-before-shorter ordering. A subsequent find `beta` fetch was retrieved/untrusted and concerned unrelated beta functionality. Initial discovery search returned irrelevant sources; platform-scoped discovery search returned unsupported. No exhaustive discovery or live provider support is claimed; retrieved data is evidence, not scope authority.
- Superseded: messages.go currently emits only default ephemeral markers; cache.go initializes configured_ttl null for all requests. Replace only explicit-one-hour results and preserve defaults.
- Omitted deliberately: no live research run, billing measurement, mixing API, environment setting, CLI/task extension, consumer pin update or usage-accounting redesign. No supplied example is dropped; invalid values are executable below.

## Tests
- Preserve default Anthropic request bytes: add TestBreakpointTTLDefault comparing fake-server captured body bytes to the existing pre-change parallelBaseline Anthropic golden, headers unchanged and configured_ttl null (integration)
- Apply explicit one-hour configuration: add TestBreakpointTTLHour calling Client.Respond with tools, policy and user input, asserting exact cache_control objects on all three breakpoints, configured_ttl `1h` in Observer.Attempt, applied_ttl null and unchanged headers with no anthropic-beta (integration)
- Preserve authority compatibility: add TestBreakpointTTLAuthority using existing two-block authority input plus a later user message, asserting four ttl `1h` markers, unchanged locations and input immutability (integration)
- Refuse invalid Anthropic values: add TestBreakpointTTLInvalid covering `5m` and `2h` in Render and Respond, provider/invalid_request naming AnthropicCacheTTL and no HTTP requests (unit)
- Preserve non-Anthropic behavior: add TestBreakpointTTLIsolation comparing existing non-Anthropic parallelRoles goldens and diagnostics for absent, `1h` and invalid option values (integration)
- Document the public option: add TestBreakpointTTLContract checking docs/contract/loop-v1.md describes AnthropicCacheTTL, empty default, `1h` and provider-only scope (integration)
- Pass all configured checks: retain unchanged go-format, go-test, go-vet and go-build commands (existing)

Builder adds these named tests as ordinary editable provider tests, reusing keyEnv, claudeText, parallelBaseline and authority fixtures. Acceptance verifies each test actually ran, not just a successful go test exit. Production files and builder-owned tests are not listed under Acceptance.

## Feasibility
- The local command `go test -json ./provider -run '^TestBreakpointTTL' -count=1` completed exit 0 in 2.4 s with no tests to run. This establishes command availability, not feature support; acceptance rejects absent named tests.
- No paid qualification performed; documentation guidance does not establish observed service acceptance.
