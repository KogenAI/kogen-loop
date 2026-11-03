# Protect resolved write destinations

Slug: l-protected-write-symlink-target
Model: not applicable — a single filesystem write/refusal has no meaningful protocol state; concrete filesystem fixtures specify its effects
Acceptance:
- .kogen/intents/l-protected-write-symlink-target/acceptance.feature
- features/steps/l_protected_write.js
- features/steps/l_protected_write_driver.go

Enforce Tools.Protected in the native write_file tool against the actual destination, not just the lexical argument. Retain direct-path protection as well. Resolve final-name links, chains and directory links, including a dangling final link to a protected missing file. Refuse before creating directories or replacing bytes at a protected destination. Return the existing protected category and refusal text naming its root-relative protected name. Leave all links and destination bytes unchanged. Keep writes through unprotected links and ordinary writes working. This replaces the lexical-only protection check, not the tool's public API or write semantics. No shell sandbox, hard-link policy, concurrent hostile link-race guarantee, provider change, publication, vendoring, global installation or CHANGELOG entry is requested. Update maintained contract documentation where it describes write protection.

## Decisions
- Refusals name checks/accept.txt, not merely shortcut.txt; successful writes follow links without replacing them (source: request).
- Preserve creation, replacement, existing permission bits and OS read-only refusal (source: request).

## Source comparison
- Addressed request Problem and Need: native tools/tools.go currently checks only relativeTo of the supplied path before replacementTarget follows links. This contract moves enforcement to include the resolved destination while retaining direct refusal.
- Addressed Synthetic acceptance 1–3: feature direct/link/chain/directory fixtures use checks/accept.txt containing keep, write replace, and preserve target and link snapshots.
- Addressed Synthetic acceptance 4–5: feature unprotected/create/replace/readonly/dangling fixtures cover successful link following, ordinary creation and replacement, mode preservation, read-only refusal and protected missing target noncreation.
- No requested behavior or settled literal is omitted, conflicting or superseded. README/testing rules remain applicable: implementation adds focused filesystem regression tests, keeps existing coverage and uses the configured checks; no CHANGELOG edit or downstream Kogen changes.

## Tests
- Direct, final-link, chain and directory-link writes cannot alter a protected destination and name it in refusal: disposable native-tool fixtures and focused Go filesystem regression tests (regression)
- Dangling links to a protected destination cannot create it: disposable missing-target fixture (regression)
- Unprotected links remain writable and intact: target content, link text and mode snapshot (integration)
- Creation and replacement retain successful behavior and replacement mode: ordinary native-tool fixtures (integration)
- Read-only file refusal preserves bytes and permissions: native-tool fixture under the normal non-root test user (integration)

## Feasibility
- A scratch attempt to inspect retained proposal formatting could not find the private retained path (exit 1); it supplied no product evidence.
- evidence: {"id":"snapshot-observer","kind":"observer","inputs":["features/steps/l_protected_write.js"],"observers":["features/steps/l_protected_write.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/l_protected_write.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/l_protected_write.js bad","exit":1,"output":"rejected\n"}]}
