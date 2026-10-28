# Allow caller-supplied session cache keys

Slug: l-cachekey
Model: not applicable — this is optional configuration wiring into the existing provider identity path, not a new session state machine
Acceptance:
- .kogen/intents/l-cachekey/acceptance.feature
- features/steps/l_cachekey.js

Add `CacheID string` to `loop.SessionConfig`. A nonempty value replaces the derived identity only for provider cache/routing purposes wherever Session currently forwards its identity to Direct. Empty preserves today's requests byte for byte, including existing provider normalization and fallback behavior. Keep generating the independent Session.ID and transcript session_id as today; this option is not a transcript identifier override. Apply the same selection on NewSession and ResumeSession: explicit CacheID wins, otherwise use the newly generated or restored session ID respectively. Do not persist a new transcript field or change mismatch validation. Callers wishing to reuse a key on resume supply it again.

Document the field in `docs/contract/loop-v1.md`, including its relationship to the existing session_id/cache identity statement and the privacy note: it is a key, not content. It is sent to providers for caching/routing; callers should not put conversation content or secrets in it. Retain existing provider length normalization without adding validation, trimming, hashing or transport behavior at the Session layer.

No CLI flag, task/schema setting, provider protocol change, or other request change. Use fake providers only. The research motivation is a follow-on review after build sharing a long prefix (research seed 28 Oct 2026); the research metric is uncached input on the first review request, not a promised improvement or a live measurement deliverable. Do not change Kogen, pins, installed runtimes or paused research work. On the shared host use temporary directories, no synthetic CPU load, and never stop processes by name/pattern or stop pids not started by this work.

## Decisions
- Expose an optional library-only cache identity override; empty retains derived identity. (source: request)
- Keep all unrelated request behavior and the CLI unchanged; document that the value is a key, not content. (source: request)

## Source comparison
- Addressed: request What to build and fake-provider acceptance are implemented by SessionConfig.CacheID selection and the shared-key/default scenarios below; existing Direct.CacheID and provider rendering remain the transport authority.
- Addressed: request Must stay (byte-identical empty requests, no CLI, no other request change) is covered by the empty compatibility case and configured regression checks, with explicit scope boundaries above.
- Superseded: docs/contract/loop-v1.md's unconditional statement that cache identity is session_id becomes conditional on CacheID being empty; transcript IDs and resume validation remain unchanged.
- Addressed: request Why, research date and metric are retained as motivation only; no cache-hit benefit, quota effect or live paid experiment is claimed.
- Addressed: request Host safety and all configured checks are required above and below. Omitted: no requested product behavior; unrelated historical testing-rule examples authorize no additional work.

## Tests
- Explicit keys are reused across distinct sessions for provider cache/routing identity: add TestSessionCacheID/shared_key in conformance using the existing fake provider and actual NewSession.Round requests (integration)
- Empty keys retain each session's derived identity and otherwise byte-identical request serialization: add TestSessionCacheID/empty_compatibility comparing captured bodies and relevant headers with existing provider rendering supplied each Session.ID, and verify distinct IDs across sessions (integration)
- Explicit and empty selection also work after resume without changing transcript identity: add TestSessionCacheID/resume_selection using temporary transcripts and fake requests for both branches (integration)
- No other request change occurs for an explicit key: add TestSessionCacheID/request_compatibility comparing raw request body bytes and routing/cache headers to existing provider rendering given that key; check unrelated headers unchanged (integration)
- Existing behavior remains intact: run configured go-format, go-test, go-vet and go-build plus README race and conformance commands (existing)

Implement the named Go test and subtests in an unprotected conformance test file. Tests must observe real library requests, not merely config values, and use existing local fake-provider infrastructure. Cover existing identity-bearing provider profiles using their established placement rules, without inventing identity fields on profiles that do not use them. Shared-key tests use `build-review-shared-key` for two distinct session IDs and verify repeated rounds keep the key. Compatibility comparisons control all inputs and normalize no body bytes; compare only volatile transport headers separately where necessary. The Cucumber wrapper checks that each named subtest actually ran and passed, so absent tests cannot satisfy acceptance. Verify contract documentation and absence of CLI/task changes during independent review.

## Feasibility
- none
