# Add named provider tool choice

Slug: l-toolchoice
Model: not applicable — request-local encoding and validation have no meaningful state
Acceptance:
- .kogen/intents/l-toolchoice/acceptance.feature
- features/steps/l_toolchoice.js

Add provider.Request.ToolChoice string and provider.SupportsToolChoice(provider.Role) bool. Nonempty names one API-level required tool for this request. Empty preserves exact existing transport bytes, including existing automatic tool_choice fields. No CLI/task option, thinking-mode change, other request change, Kogen vendored edit or pin update.

Support uses the effective wire and profile settings, including profile wire overrides, consistently with rendering. Responses and Chat Completions support named choice. Current Anthropic Messages profiles use adaptive thinking: report false and refuse nonempty ToolChoice with provider/unsupported_capability, exit 4, explicitly mentioning ToolChoice and the route, before any network call. Unknown providers report false. Never silently ignore an unsupported choice. If an existing Messages profile permits forced choice without changing thinking, encode {"type":"tool","name":"submit"}, retaining disable_parallel_tool_use when requested. Do not invent a profile for testing.

With tools, Responses sends {"type":"function","name":"submit"}; Chat sends {"type":"function","function":{"name":"submit"}}. Other nonempty names use the same transformation. Without tools retain existing omission on supporting routes; unsupported refusal still applies. Document the field, support check and reminder fallback in docs/contract/loop-v1.md.

Tests named below exercise real Client.Respond using private offline credentials, existing local transport fixtures and recorded response shapes, bounded contexts, and no external calls. Capture pre-change goldens before modifying encoders. Test empty bytes against those goldens on every effective wire, with and without tools and existing parallel controls. Forced cases assert exact tool_choice shapes and compare all remaining JSON semantically, preserving array/string order. Include chatgpt, opencode-go, openai-compatible, SuperGrok profile overrides and current Anthropic profiles. Unsupported tests cover Render and Respond with zero transport attempts. All configured checks must pass. Fixtures use temp dirs only; never kill by name/pattern or foreign pid and never generate synthetic CPU load.

## Decisions
- Keep this API provider-library-only, with no CLI (source: request)
- Preserve empty-field bytes on every route (source: request)
- Refuse unsupported choice before network so callers can use reminders (source: request)

## Source comparison
- Addressed: request What 1–4 via the named public field, support function, effective-wire encoding/refusal and docs above; offline acceptance exercises submit, empty bytes and unsupported refusal.
- Conflicting: “no tool_choice sent” for empty conflicts with explicit byte compatibility and existing auto fields. Preserve auto as the reference diff does, adding no new choice for empty.
- Superseded: reference diff's Anthropic ignore assertion contradicts explicit refusal; require rejection. Retain its public names and exact Responses/Chat shapes, extending coverage to all effective routes and transport bytes.
- Addressed: K-SHAPEFORCE motivation (38/970 no-submit sessions; terra 30/226, sol low 8/277) establishes the submit example, not new host policy. Kogen vendored bytes change only via its sync script; this work changes this library only.
- Addressed: host safety and all configured checks are required above. Omitted deliberately: CLI, Kogen rollout, sync/pin updates and automatic loop forcing are outside this request.
- Documentation evidence: OpenAI general search and a Claude-targeted search returned no usable protocol excerpts. Fetches of https://platform.openai.com/docs/guides/function-calling and https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use returned retrieved, truncated, untrusted HTML, not usable protocol text. No live acceptance is claimed; exact shapes are the request's offline contract.

## Tests
- Named selection changes only tool_choice on supporting transports: add TestToolChoiceTransport with captured Respond bytes (integration)
- Empty preserves every route's pre-change bytes: add TestToolChoiceEmptyBytes with pre-change golden transport bodies (regression)
- Capability reporting agrees with pre-network refusal: add TestToolChoiceUnsupported for current Messages profiles, Render, Respond and unknown support (integration)
- Other requests and CLI stay unchanged: retain existing tests and run all configured checks (existing)

## Feasibility
- none
