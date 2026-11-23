# Correct the search_text NUL contract

Slug: document-search-nul-contract
Model: not applicable — this documentation-only correction has no meaningful state
Acceptance:
- .kogen/intents/document-search-nul-contract/acceptance.feature
- features/steps/document-search-nul-contract__docs.js

Correct only docs/contract/loop-v1.md so search_text documents refusal of a pattern containing a NUL byte rather than cutting it at the first NUL. Describe the returned error text and classification consistently with tools/search_nul_test.go, including the error-kind table. Preserve the documented RE2 syntax, search ordering and output bound. Do not change search_text behavior, implementation or tests, or rewrite unrelated contract claims.

## Decisions
- Document NUL-containing search_text patterns as refused with text `error: pattern contains a NUL character` and error_kind `git_failed`; change documentation only, preserving existing search behavior and tests. (decision: D1, round 1) (evidence: tools/search_nul_test.go; tools/tools.go; docs/contract/loop-v1.md) (source: request)

## Source comparison
- Addressed: Request evidence ev-98b04ef0 identifies the first-NUL truncation claim in docs/contract/loop-v1.md as contradictory to tools/tools.go and tools/search_nul_test.go. The outcome, Decision D1 and acceptance's refusal/error/classification checks replace that claim, including the corresponding error-kind table entry.
- Addressed: Request acceptance 1 requires NUL refusal, the tested error text and classification; the scenario checks all three and rejects retention of the first-NUL cutting claim, its supplied wrong-implementation counterexample.
- Addressed: Request acceptance 2 requires preservation of RE2 syntax, ordering and output bound; acceptance checks the existing documented syntax, Git record processing, ordering and 16384-byte delivery bound. Controls cover retaining truncation, incorrect classification and unrelated search-claim changes.
- Addressed: Request scope is docs/contract/loop-v1.md; production search_text behavior and tests remain out of scope. No requested behavior is omitted, superseded or deliberately changed beyond correcting this documentation mismatch.

## Tests
- NUL-refusal documentation: read the caller contract and verify refusal, exact error text, git_failed classification and absence of first-NUL truncation claims (regression)
- Unrelated search claims: verify the existing RE2 syntax, search record processing, ordering and delivery-bound passages remain documented (regression)

## Feasibility
- none
