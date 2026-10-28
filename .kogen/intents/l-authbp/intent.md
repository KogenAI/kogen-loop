# Add optional authority cache breakpoint

Slug: l-authbp
Model: not applicable — stateless request transformation and preflight validation
Acceptance:
- .kogen/intents/l-authbp/acceptance.feature
- features/steps/l_authbp.js

Implement L-AUTHBP, research lever 2 provisionally started by main: optionally mark the end of stable authority (Intent, feature, README, rules) in the first user message. The intended research metric is review cached-input share and cost on the Claude lineup. This delivery enables that experiment, not measurement or a claim of benefit.

## Decisions
- Default off; default request bytes identical on every route; other routes unchanged; fake servers only. (source: request)
- Use `provider.Request.AuthorityBoundary *int`, nil off, otherwise a zero-based content block index in the first user message. This technically settles the requested index-or-marker choice; no CLI/task or loop option. (source: request)
- Enabled Messages rendering preserves first-user text block boundaries for ordinary `input_text`/`text` blocks instead of flattening them; string content has block 0. Raw `anthropic_message` blocks retain their boundaries. Place the marker on the selected last stable authority block, not the following dynamic evidence. Disabled rendering stays unchanged. (source: request)
- Refuse negative/out-of-range indices, missing first user, and non-text targets before HTTP with an error containing `invalid authority boundary`. Never mutate caller input. (source: request)
- Count distinct actual cache_control locations across final tools/system/messages, including retained raw markers. An already-marked authority target is idempotent; above four refuse before HTTP with `cache breakpoint limit exceeded`, without silently dropping markers. Apply the new validation only when enabled. (source: request)
- Use the same TTL policy as the existing breakpoints, currently implicit five minutes without an explicit ttl. L-TTL is absent here; do not add a TTL feature. If integrated with L-TTL, respect its policy and longer-TTL-first order in tools/system/messages; never reorder content. (source: request)
- Use temporary directories for generated test artifacts, never stop processes by name or pattern, only owned pids; no synthetic CPU load. (source: request)

Document the pointer option, indexing, default, route scope, TTL policy, idempotence and preflight errors in docs/contract/loop-v1.md. No paid evaluation, telemetry, benchmarking or Kogen consumer wiring is added.

## Source comparison
- Addressed: request Why and What to build by the outcome and Decisions, including stable authority examples and research metric. Paid measurement is deliberately outside delivery, not a claimed result.
- Addressed: Acceptance default golden, one extra marker/four total, fifth refusal and all configured checks by the scenarios and Tests below.
- Addressed: Must stay and Host safety by byte preservation, Messages-only scope, fake-only tests and host restrictions above.
- Superseded only on opt-in: provider/messages.go:149 currently flattens user text blocks; retaining first-user boundaries is necessary to distinguish authority from dynamic evidence. Default behavior is retained.
- Addressed: docs/contract requirement by the explicit documentation update above. No other requested behavior is omitted.
- Technical evidence: documentation search returned retrieved general sources; fetches of https://platform.claude.com/docs/en/build-with-claude/prompt-caching and its .md variant returned truncated, explicitly untrusted material, not live capability proof. Repository ephemeral policy and the requested four-marker limit govern this contract.

## Tests
- Default byte fidelity on all routes: add TestAuthorityBreakpointDefault using existing wire goldens unchanged, including Messages (regression)
- Exactly one extra authority marker with matching TTL: add TestAuthorityBreakpointEnabled through real Client.Respond and a local fake Messages server; tools, system, newest and authority total four; dynamic evidence remains unmarked (integration)
- Boundary indexing and input preservation: add TestAuthorityBreakpointBoundaries for indices 0 and 1 of a two-block first user, string index 0, negative and adjacent out-of-range indices, absent user and non-text targets; invalid cases send no HTTP (unit)
- Four-marker ceiling and idempotence: add TestAuthorityBreakpointLimit with raw first-user blocks and a later newest message; three existing distinct locations plus authority succeeds at four, four existing plus distinct authority refuses at five before HTTP, and an already-marked target is not double counted (integration)
- Other routes unchanged even when enabled: add TestAuthorityBreakpointOtherRoutes comparing enabled/disabled captured bytes on every supported non-Messages route with fixed identities (integration)
- Documentation and existing behavior: update docs/contract/loop-v1.md and run unchanged go-format, go-test, go-vet, go-build and acceptance (existing)

The Build implements these named tests in package kogen-loop/provider using existing fake-server/golden helpers. Tests assert real outputs, not private call order. Keep useful existing tests. The acceptance bridge requires every named behavioral test actually to run and pass, rather than trusting Go's exit status alone.

## Feasibility
- none
