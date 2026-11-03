# Refuse NUL characters in search patterns

Slug: search-text-nul-pattern-refused
Model: not applicable — pattern validation is stateless
Acceptance:
- .kogen/intents/search-text-nul-pattern-refused/acceptance.feature
- features/steps/search_text_regex_dialect.js
- features/steps/list_files_quoted_paths_driver.go

Refuse every search_text pattern containing a NUL character rather than searching a truncated prefix. Return the short model-visible text `error: pattern contains a NUL character`, classified as api.ToolErrorGit, just like the existing invalid-expression error. Do not return matches for rejected patterns. Replace only the silent C-string truncation of search patterns; preserve non-NUL behavior, formatting, ordering, the 16 KiB output cut, `(no matches)`, and existing invalid-expression diagnostics. No changes to path handling or regex dialect are requested.

## Decisions
- Choose the request's preferred refusal rather than full-pattern searching; use `error: pattern contains a NUL character`. (source: request)
- Use a fresh Git repository containing a.txt with `alpha only` and b.txt with `beta only` for the reproductions. (source: request)

## Source comparison
- Addressed: Request Problem and Need prohibit silent shortening, including `alpha<NUL>beta` and `<NUL>beta`; the outcome above and the two NUL scenarios require explicit refusal, not prefix or empty-pattern matches.
- Addressed: Synthetic acceptance 1–5 is preserved in executable scenarios through the real Tools.RunContext entry point, JSON-encoded NUL arguments and a fresh Git fixture. The non-NUL, absent and invalid-expression scenarios preserve their exact outputs.
- Addressed: Need's unchanged output format, ordering and 16 KiB cut remain requirements, covered by existing tools tests and configured full Go checks; classification is explicitly api.ToolErrorGit and must have focused regression coverage.
- Superseded by the chosen preferred outcome: Request's permitted full-search alternative is not implemented; both NUL cases must refuse. No requested behavior is omitted or conflicting.

## Tests
- NUL anywhere in a pattern is refused without prefix matches: add a focused tools regression test through RunContext for both supplied NUL patterns, asserting text and api.ToolErrorGit; executable acceptance reproduces both against Git (regression)
- Ordinary `alpha` matches only a.txt and an absent pattern yields `(no matches)`: acceptance through the existing generic tool collector in a fresh local Git repository (integration)
- Invalid `(` retains `error: invalid pattern: missing closing ): ` followed by backtick-parenthesis-backtick and api.ToolErrorGit: acceptance checks exact text and focused tools regression coverage checks classification (regression)
- Non-NUL regex semantics, rendered ordering, output format and 16 KiB cutting remain unchanged: retain existing tools/contract coverage and run configured Go checks (existing)

## Feasibility
- none
