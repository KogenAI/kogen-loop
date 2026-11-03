# Prepare public repository documentation

Slug: l-public-ready
Model: not applicable — documentation cleanup has no meaningful runtime state
Acceptance:
- .kogen/intents/l-public-ready/acceptance.feature
- features/steps/l_public_ready.js

Make README.md and documentation, including committed records under .kogen/intents/, useful and safe for a public clone of KogenAI/kogen-loop. Replace private setup, unavailable references and local landing/delivery narratives with public explanations. Preserve technical contracts, historical meaning, license attribution, hashes and assertions. Do not change runtime behavior, executable tests, dependencies or configuration. Only README and documentation/Intent records are implementation edit targets; the new acceptance step is shaping infrastructure, not permission to edit other executable files.

The README must explain the standard-library Go library/CLI, its model/tool loop and its role in Kogen without claiming ownership of delivery policy. Give public clone, build, offline capabilities and test instructions consistent with go.mod and the actual CLI. Keep useful maintained contract navigation. Remove local status, internal delivery notes and unavailable workspace references rather than presenting those as public workflows. Do not add CHANGELOG entries. Keep existing checks and assertions unchanged.

Inspect the complete tracked tree for genuine documentation links and sensitive residues, not just the README. Repair documentation links or remove unavailable documentation references; relative destinations and fragments must exist. Kogen-wide links use https://kogen.dev or https://github.com/KogenAI/kogen. Real external documentation links must resolve publicly without credentials; synthetic URLs in protocol fixtures are not hyperlinks promised to readers. No private-module setup, token instructions, private mirrors, contribution refusal or maintenance promise belongs in public documentation. No SECURITY.md, CONTRIBUTING.md or BRANDING.md is to be added. Issues and pull requests are already disabled: do not change GitHub settings or mention their status.

Replace personal identities, user-specific paths and runner host identities in committed Intent records with neutral placeholders such as <checkout>, preserving what each record says. Documentation fixtures that require paths use synthetic paths. This includes old feature-file documentation expectations: substitute neutral provenance paths consistently with cleaned extraction documentation, without deleting any assertion or changing hashes. Do not erase factual technical history simply because it describes a past failure.

Audit reachable Git history read-only for the same categories. Add docs/public-history-audit.md containing the audited HEAD, audit method and one row per historical commit/file/category hit (deduplicate identical commit/file/category rows). Use full commit IDs and repository-relative filenames, and describe findings by category without republishing identities or sensitive literal values. State limitations, including inaccessible refs if any. Do not rewrite history, amend existing commits, force-push, or try to repair historical objects. Deliver the inventory to the owner for a separate decision. This report must be substantive, not merely an audit instruction.

## Decisions
- README and documentation, including committed Intent records, are the only implementation edit scope; .kogen/project.yaml is untouched (source: request).
- The local lineup override is not public-tree evidence; its check-wrapper paths are exempt and must not be edited. Main's configuration has no private-module setup (source: request).
- The two existing executable files features/steps/standalone_loop.js and features/steps/l_parallel_tests_sys.js are explicitly exempt from current-tree path cleanup and remain unchanged, even though their unavailable local dependencies are not suitable for a public clone (source: answer 1).
- State contact@kogen.dev exactly once in README; use the two approved Kogen-wide public destinations (source: request).
- Do not add policy files, contribution refusals, maintenance promises or notices about disabled issues/PRs (source: request).
- Keep all runtime behavior and assertions, pass every existing configured check, and leave Git history intact while delivering historical findings (source: request).

## Source comparison
- Addressed: request Problem and Need are implemented by the README/public documentation cleanup, complete link inspection, neutral substitutions and historical inventory described above and the acceptance scenarios below.
- Addressed: re-filed 3 Nov scope excludes configuration and executable implementation files; the local lineup override is excluded from reported current-tree defects, not silently repaired.
- Addressed: h16 inclusion explicitly covers all committed Intent records, including feature expectations, not just Markdown. Neutral replacements preserve each record's technical assertions.
- Superseded: original unqualified current-tree cleanup is narrowed only for the two named executable steps by answer 1; these exceptions do not excuse documentation residues elsewhere.
- Addressed: all supplied path/host examples are represented by category detection in the acceptance step, without reintroducing the sensitive originals in this public Intent. Personal identity residues are also detected. Full original request remains authoritative; no runtime expansion or GitHub administration is added.
- Addressed: unchanged checks/assertions and history preservation are mandatory final verification requirements; historical audit output is sanitized public documentation, not rewritten history.

## Tests
- Public README explains the component and supplies plain-clone Go setup/build/test instructions and one inquiry address: inspect actual README output (scenario).
- Documentation and committed Intent records contain no personal/runner residues or private setup and no prohibited policy files: inspect tracked documentation (integration).
- Documentation links are public and useful: inspect every changed and existing documentation link, resolve local targets/fragments and verify external destinations without authentication during Build/review (integration).
- Historical findings are delivered without rewriting history: inspect docs/public-history-audit.md and compare pre/post existing Git objects and ancestry during final review (integration).
- Runtime behavior and assertions remain unchanged: run existing configured go-format, go-test, go-vet and go-build plus README race/conformance commands; review the documentation-only implementation diff (existing).

## Feasibility
- none
