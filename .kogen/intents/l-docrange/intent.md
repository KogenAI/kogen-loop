# Add ranged documentation reads

Slug: l-docrange
Model: not applicable — independent stateless lookups with caller-carried byte positions
Acceptance:
- .kogen/intents/l-docrange/acceptance.feature
- features/steps/l_docrange.js

Extend tools/documentation.go, the definition in tools/defs.go and docs/contract/loop-v1.md with optional fetch offset and find arguments. The October 28 Studio/L-TTL incident concerned the 1-hour cache duration section at byte 58,229 of the 162 KB platform.claude.com/docs/en/build-with-claude/prompt-caching.md page; acceptance uses fake origins only, never that network endpoint. Implement the named acceptance tests in unprotected tools/l_docrange_test.go using tools.Documentation.Lookup(map[string]any) string, lookup and newFixtureOrigin. Preserve useful existing tests.

## Decisions
- Use efficient ranged on-demand reading without caching or raised limits (source: request)
- offset is an integer byte index into the decoded body after existing BodyBound processing. Move interior UTF-8 offsets backward to the rune start; clamp negative offsets to zero and past-end offsets to the end. Empty find behaves as absent (source: request)
- find is case-insensitive text. Among matches at or after normalized offset prefer the first matching Markdown ATX heading; otherwise use the first text match. Start the body at that line's beginning. Preserve original byte coordinates (source: request)
- No match returns ordinary status not_found, empty body, a short note in error, correct body_total, preserved source URL and untrusted classification, and no next_offset (source: request)
- Ranged fetches report body_offset and body_total in decoded bytes. Compute next_offset after fitting as the first unconsumed source byte; omit at end. Synthetic safety markers do not consume source bytes (source: request)
- Plain fetch without offset or find returns exactly today's body bytes and adds only body_total and next_offset when truncated, not body_offset. State this exception plainly in docs/contract/loop-v1.md. All fetch outcomes report body_total, zero if no body was retrieved; ranged outcomes also report body_offset (source: request)
- Preserve the default 16384-byte encoded JSON bound, configured L-DOCBOUND bounds, body bound, host pinning, based-source behavior, untrusted marking, search output, timeout and redirect behavior. No extra fetches, retry increases or caching. Definition text describes the new arguments in one or two plain sentences (source: request)
- Use temp directories only, no synthetic CPU load, no stopping by process name/pattern, and stop only owned pids (source: request)

## Source comparison
- Addressed: request What to build 1–3 maps to Decisions and the five named executable acceptance tests. UTF-8 positions and heading preference are settled above.
- Addressed: Must stay's explicit plain-fetch exception overrides the general body_offset wording: plain responses add only body_total and next_offset when truncated. Search remains unchanged.
- Addressed: L-DOCBOUND is present in tools/documentation.go and docs/contract/loop-v1.md; its configured result/body bounds and validation remain intact.
- Addressed: acceptance preserves the fake 160 KB late-heading reproduction, byte 100000 offset, whole-page continuation, no match, compatibility and all configured checks. The historical real 162 KB page and byte 58,229 are retained as context, not claimed live evidence.
- Addressed: documentation, definition wording, one existing fetch operation per call, no raised timeout/limits/retries, and shared-host safety remain in scope. No requested behavior is intentionally omitted or otherwise superseded. No host Kogen synchronization or unrelated paused work is included.

## Tests
- Find a late heading within result bounds: add TestLDOCRangeFind with heading preference, mixed case, prose fallback and offset exclusion (regression)
- Normalize byte offsets and page without gaps or overlap: add TestLDOCRangePaging reconstructing the entire decoded fixture with bounded progress (integration)
- Return an ordinary no-match result: add TestLDOCRangeNotFound asserting status, note, metadata and no continuation (integration)
- Preserve plain body bytes and search: add TestLDOCRangeCompatibility pinning pre-change body bytes and semantic search JSON (regression)
- Preserve configured bounds and network custody: add TestLDOCRangeConfigured and retain existing documentation tests for host pinning and timeout (integration)
- Advertise arguments and document fields: update definition golden expectations and verify contract text including the plain-fetch exception (existing)

Before completion run configured go-format, go-test, go-vet, go-build and acceptance. The named tests must exercise real Lookup behavior, not be empty passing markers. Pin compatibility bodies from the pre-change implementation, not by recomputing them with the new code. Acceptance.feature specifies fixture values and observable outcomes. Update only existing expectations deliberately affected by added fetch metadata and definition wording.

## Feasibility
- none
