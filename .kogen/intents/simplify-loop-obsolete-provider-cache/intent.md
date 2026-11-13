# Remove obsolete provider and cache compatibility

Slug: simplify-loop-obsolete-provider-cache
Model: not applicable — removal of obsolete compatibility wording and forms; no state machine involved
Acceptance:
- .kogen/intents/simplify-loop-obsolete-provider-cache/acceptance.feature
- features/steps/simplify-loop-obsolete-provider-cache__steps.js

A role with an omitted or unknown provider is an error and never selects a ChatGPT or any other route; only the five catalog providers (chatgpt, supergrok, opencode-go, anthropic, openai-compatible) are selectable, each by explicit name. No upgrade branch for an old saved cache-control representation exists. Every caller, config fixture, test, doc and comment in this repository uses the explicit current forms and carries no mention of "legacy" provider or old-cache handling (including the words "legacy" and "older checkpoints" in provider code, tests and docs). Supported provider protocols, active refusals (including refusing a saved openai-compatible key that has no origin) and cancellation are preserved unchanged. The full go test suite for the repo (`go test ./...`) passes. No setting, environment variable or alias is added.

## Decisions
- Lookup of an empty or unknown provider name stays not-found and Render, Respond and the CLI refuse it with "unknown provider" (CLI exit 2, invalid_task); no default route exists. (evidence: provider/provider.go; provider/respond.go; cmd/kogen-loop/main.go) (source: request)
- Remove the word "legacy" and the phrase "older checkpoints" from provider/, cmd/, README.md, CHANGELOG.md and docs/contract: rename TestLCredOriginLegacy and reword comments and docs (e.g. "unbound key", "total of a validated usage object") while keeping the behaviors. (evidence: provider/cred_origin_test.go; provider/origin.go; provider/usage.go; provider/cache.go; CHANGELOG.md) (source: request)
- Occurrences of "legacy" that name other things (Requester types in loop tests, kogen-build file names in contract/README.md, .kogen/intents history) are out of scope and unchanged. (evidence: contract/README.md; loop/tool_overlap_compat_test.go) (assumption: the request's grep concerns provider and cache code, docs and tests, not unrelated Requester or provenance mentions) (source: request)
- The current tree already has no empty-provider mapping and no cache upgrade branch; the Build verifies that and removes any remaining obsolete form it finds, adding a unit test that an omitted and an invalid provider return errors from Render and Respond. (evidence: provider/provider.go; provider/respond.go; contract/provider_test.go) (source: request)

## Source comparison
- Addressed: empty provider no longer maps to ChatGPT; old cache-control upgrade removed; fixtures/tests explicit; grep cleanliness; preserved refusal and cancellation; the full go test suite passes; no new setting. Omitted: unrelated Requester and provenance "legacy" mentions, see Decisions.

## Tests
- Omitted or invalid provider is an error and selects no route: add a provider unit test calling Client.Render and Client.Respond with provider "" and "nobody" expecting an "unknown provider" refusal, plus acceptance scenario through the built CLI (unit)
- Explicit current providers still work: existing provider and conformance tests (existing)
- No obsolete wording remains: acceptance grep scenario (scenario)
- Refusal and cancellation unchanged: existing loop, provider and conformance tests (existing)
- Full go test suite passes: go test ./... (existing)

## Feasibility
- none
