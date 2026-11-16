# Bound an explicit external Messages route

Slug: experimental-messages-route-bounds
Model: not applicable — the change adds a provider catalog entry and reuses the existing stateless request, budget and credential checks
Acceptance:
- .kogen/intents/experimental-messages-route-bounds/acceptance.feature
- features/steps/experimental-messages-route-bounds__route.js
- features/steps/experimental-messages-route-bounds__driver/route_driver.go.txt

Add one explicit, experimental provider `messages-compatible` to the provider catalog: a streamed Messages wire whose destination is only the role's `base_url`. It lets the existing stage `RequestBudget` (request count, deadline, encoded-input bytes, per-response `MaxOutputTokens` carried as `max_tokens`) bound an external Messages endpoint. It is research plumbing only: no model adoption, no default lineup change, no live provider call, no purchase, no Qwen key and no permission to run the QC studies. The native `anthropic` provider (fixed destination, its own credential) and the generic `openai-compatible` Chat route (still refuses `MaxOutputTokens`) keep their contracts.

## Decisions
- The new provider is named `messages-compatible`, label `Messages-compatible (experimental)`, Messages wire, API-key credential required (not optional), no default APIBase, listed in `provider.Catalog()` and therefore in `capabilities --json` providers. Its destination is `base_url` (trailing `/` trimmed) plus `/v1/messages`; `KOGEN_PROVIDER_URL` is never used for it and no default destination exists. (evidence: provider/provider.go; provider/respond.go; provider/messages.go) (source: request)
- A request on this route with an empty `base_url` is refused (as for openai-compatible) before credentials are read or anything is sent. (evidence: provider/respond.go) (source: request)
- Credentials reuse the existing origin-bound key mechanism: the key is saved under the `messages-compatible` name with the origin it is for (`LoginWithBaseURL`, like openai-compatible) and sent only when the request origin equals the saved HTTPS origin. A missing key, a key without an origin, a different origin or a plaintext origin sends nothing. The native `anthropic` key is never read for this route. (evidence: provider/origin.go; provider/creds.go; provider/login.go) (source: request)
- No profile resolves for this provider, so classification stays `experimental`; the Messages body is the existing one (stream true, adaptive thinking, `max_tokens` 128000 lowered to a smaller `MaxOutputTokens`). Forced `ToolChoice`/`RequireTool` is refused with `provider/unsupported_capability` before dispatch by the existing adaptive-thinking rule. No parameter is dropped and no setting is added. (evidence: provider/messages.go; provider/wire.go; provider/profiles.go) (source: request)
- Budget checks, persistence, retries and failed-attempt visibility are the existing common `Respond` path unchanged; token bounds are never described as Credit or dollar guarantees. (evidence: provider/budget.go; provider/respond.go) (source: request)
- OfficialText and docs/contract/loop-v1.md identify the route as explicit and experimental, state what local fixtures tested, what is unsupported (profiles, forced tool choice, images, Responses/Chat output bound) and that live qualification and account debit reconciliation are still required, that Token Plan unattended batches remain prohibited and that the four QC studies stay draft/unregistered/held. (evidence: provider/profiles.go; docs/contract/loop-v1.md) (source: request)
- No `kogen-loop run` task format or default changes; the stage budget remains library-only. (evidence: cmd/kogen-loop/main.go; api/api.go) (source: request)

## Source comparison
- Addressed: explicit destination/auth identity (scenarios 1-2), budget bounds with max_tokens and unsupported refusals (3), two-turn tool fixture, usage, quota failure visibility (4-5), experimental labeling and documentation (6-7).
- Omitted deliberately: live calls, profiles for any model, Qwen credentials, default changes, CLI budget fields, claims of billing qualification.
- Unchanged: native Anthropic route and openai-compatible Chat route.

## Tests
- Explicit destination, key and model: TestExternalMessagesDestinationAndRequest (integration)
- Ambiguous or mismatched credential/destination sends nothing: TestExternalMessagesSendsNothingWhenAmbiguous (integration)
- Budget bounds and unsupported refusals: TestExternalMessagesStageBudgetBounds (integration)
- Two-turn tool fixture: TestExternalMessagesTwoTurnToolFixture (integration)
- Failed attempts counted and visible: TestExternalMessagesFailuresStayVisible (integration)
- Experimental declaration and native unchanged: TestExternalMessagesRouteIsDeclaredExperimental (unit)
- Documentation names bounds and prohibitions: scenario step reading docs/contract/loop-v1.md (scenario)

## Feasibility
- none
