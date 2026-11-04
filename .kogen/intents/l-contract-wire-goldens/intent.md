# Pin consumer provider request bodies

Slug: l-contract-wire-goldens
Model: not applicable — this test-only change pins deterministic request transformations, not new state
Acceptance:
- .kogen/intents/l-contract-wire-goldens/acceptance.feature
- features/steps/l-contract-wire-goldens__gate.js

Add consumer-facing provider request body goldens to contract/testdata/loop_knobs_golden.json and exported-interface tests in contract/. Generate expected bodies from current behavior and commit them; tests must read the committed fixture, never regenerate it during ordinary tests. No production behavior changes. Existing provider tests remain useful and must remain intact.

Use provider.Client.Body or Render through github.com/KogenAI/kogen-loop/provider, not internal helpers. Cover the six current baseline routes (chatgpt, supergrok, anthropic, anthropic-profile, opencode-go, openai-compatible) with the fixed requests in provider/baseline_bodies_test.go; additionally cover tools present and absent using the cases in provider/testdata/tool_choice_empty_golden.json. Preserve model, effort, instruction, input, tool and cache identity literals from those local fixtures. Compare decoded JSON objects semantically, preserving array and string order. Explain provenance from kogen cli/research_removal_test.go and cli/testdata/loop_knobs_golden.json in test comments; those consumer files are motivation, not dependencies required to run this repository's gate. New tests must have names beginning TestProvider so the focused acceptance command exercises them alongside existing provider consumer contracts. Include actionable case-specific golden mismatch diagnostics.

## Decisions
- Test-only, generated from current behavior; no provider or CLI behavior changes (source: request).
- No new Kogen CLI commands or flags, no timeout increase, and no changes to kogen cli/go.mod or go.sum (source: request).
- Build against the current module github.com/KogenAI/kogen-loop, not the historical import path (source: request).
- The kogen-review search_text definition pin belongs to K-REVIEW-DROP-LOOP-DEF-PIN and is not part of this change (source: request).
- Scope acceptance to provider contracts, not unrelated shell/process-group tests. Keep configured whole-project checks unchanged (source: request).

## Source comparison
- Addressed: request L-CONTRACT-WIRE-GOLDENS/F13 asks loop to catch provider-body drift first; the committed contract fixture and tests above run in the existing go test ./... gate without importing kogen.
- Addressed: current-behavior generation and no behavior change; reuse current local baseline bodies and tools-present/absent cases rather than inventing protocol behavior.
- Addressed: rebuild after candidate 56a17e0 rebased onto 4a8ad8d failed due to L-MODULE-PATH; all new imports use the actual go.mod module path.
- Superseded: earlier acceptance requiring the entire contract suite inside each scenario. The reported child-subreaper failures in TestRunInterruptStopsTheCommandAndRefusesLaterOnes ('the interrupted group remains: <nil>'), TestRunKillGroupOnExit ('the swept group remains: <nil>'), and occasional TestRunTimeout hang do not establish a provider defect. Focused acceptance avoids those tests; normal configured go-format, go-test, go-vet and go-build remain mandatory and are not weakened. If they fail in the delivery environment, report an honest environment stop, not a provider fix or timeout increase.
- Omitted intentionally: changes to process custody, unrelated consumer pins, consumer module dependencies, and CLI flags. They are outside this test-only request. The previous builder-reported contradiction is unproven evidence, not authorization to edit a protected baseline or reuse old green.

## Tests
- Consumer request bodies are pinned in loop's own contract gate: add exported-provider golden comparisons for all specified routes and tools variants, reading contract/testdata/loop_knobs_golden.json (integration).
- Existing production behavior is unchanged: retain provider baseline tests and existing provider consumer contracts (existing).
- The committed golden is present and the focused provider contracts pass without running unrelated process-group contracts: acceptance fixture readability and go test ./contract -run Provider -count=1 (integration).

## Feasibility
- Focused provider contracts pass on the unchanged tree with go test ./contract -run Provider -count=1; the existing baseline test also passes with go test ./provider -run '^TestDefaultRequestBodies$' -count=1. This verifies the actual current module path and the scoped route without claiming resolution of unrelated process tests. (probe: exit 0, 3.6 s)
