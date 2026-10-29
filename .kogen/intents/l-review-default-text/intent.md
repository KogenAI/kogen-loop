# Correct the recommended review default text

Slug: l-review-default-text
Model: not applicable — a static copy correction has no meaningful state
Acceptance:
- .kogen/intents/l-review-default-text/acceptance.feature
- features/steps/l_review_default_text.js

Correct provider.OfficialText in provider/profiles.go, the loop-owned text consumed by `kogen provider list`, so its recommended ChatGPT defaults line names Review gpt-6.1-terra/medium instead of Review gpt-6.1-sol/high. Preserve Shape gpt-6.1-sol/high and Build gpt-6.1-sol/medium and all other output. Update loop tests and any maintained docs that assert the old recommendation. Existing review/high qualification evidence is not a default recommendation and must remain unchanged.

This is L-REVIEW-DEFAULT-TEXT, a fix for kogen-loop associated with K-DEFAULT-REVIEWER, intended for the next Kogen re-pin (kogen-main, 29 Oct 2026). It does not perform that re-pin or modify Kogen. No other provider, model or request change; no new option. All configured checks must pass. Shared-host safety applies: never stop processes by name or pattern, only pids started by this work; no synthetic CPU load; temporary artifacts only in temp directories.

## Decisions
- Print exactly the recommendation in the acceptance scenario, retaining the omitted-role explanation and punctuation. (source: request)
- Leave Shape and Build recommendations and actual provider/model/request behavior unchanged. (source: request)

## Source comparison
- Addressed: request Acceptance's exact full line is asserted in acceptance.feature against the public provider.OfficialText output, not a source-text match.
- Addressed: request What to change requires focused loop regression coverage and updates to docs asserting the line; repository search found the old recommendation in provider/profiles.go, while provider/profiles_test.go asserts separate qualification text. Preserve that qualification assertion and add recommendation coverage.
- Addressed: request Must stay and Host safety are retained above; configured go-format, go-test, go-vet and go-build remain required and unchanged.
- Addressed: request Why and landing context are retained above. This repository has no `kogen provider list` command: cmd/kogen-loop exposes version, capabilities and run. Acceptance therefore exercises the actual public loop text producer used by the external command; adding a new CLI is out of scope.
- Omitted: no requested behavior. No conflict or supersession of the supplied contract is intended.

## Tests
- Correct the recommended review default while preserving the full Shape/Build line and suffix: acceptance calls provider.OfficialText through a temporary Go consumer and compares the complete recommendation line; add focused Go regression coverage in provider/profiles_test.go (regression)
- Preserve unrelated behavior: run all configured checks, keeping existing qualification assertions and provider tests (existing)

## Feasibility
- none
