# Reject invalid discovery scopes

Slug: l-invalid-discovery-scope
Model: not applicable — argument validation is stateless; correction is a subsequent independent call
Acceptance:
- .kogen/intents/l-invalid-discovery-scope/acceptance.feature
- features/steps/l-invalid-discovery-scope__scope.js

Prevent list_files and search_text from silently broadening invalid supplied scopes to the repository root. Validate before any repository discovery. Return a short ordinary tool error naming path for a non-string supplied path, and identifying malformed arguments for raw payloads that are not valid JSON objects. These errors must not terminate the session; subsequent corrected calls remain usable. Do not change unrelated tools or valid discovery behavior.

## Decisions
- Omitted path, empty string and "." retain root behavior; valid scoped calls retain exact outputs, inclusion rules, containment refusals and result bounds. (source: request)
- Invalid supplied path values include 5, null, arrays and objects. Malformed raw payload examples are not json, [] and null. (source: request)
- Every generated Go driver is gofmt-formatted before writing and building; no unformatted Go artifact is delivered. All configured checks must pass before approval. (source: request)

## Source comparison
- Addressed: request Problem and Need by replacing optionalPath's non-string root fallback and the malformed listing root fallback with repairable tool errors, before Git discovery.
- Addressed: synthetic acceptance 1–4 by acceptance.feature's invalid-value matrix, recording Git adapter, real disposable left/one.txt and right/two.txt containing needle, and correction within the same Tools instance.
- Addressed: synthetic acceptance 5 by the root/right matrix and preservation of existing containment, inclusion and bound tests; do not rewrite their unchanged expectations except golden cases that expressly encode the superseded invalid-input behavior.
- Superseded: tools/testdata/tools_golden.json expectations for path:5 and malformed listing arguments that currently return root results. Update these to errors, not deletion of coverage.
- Addressed: delivery decision following build b0c7c0f6 through runtime gofmt and configured go-format/go-test/go-vet/go-build gates. The former unformatted features/steps/l_invalid_scope_driver.go is not reused.
- Omitted: no requested behavior or settled non-secret literal; exact error wording beyond identifying path or malformed arguments is intentionally not prescribed by the request.

## Tests
- Supplied non-string paths fail before discovery for listing and search: invalid-path matrix with recording repository adapter (regression)
- Non-object or malformed raw arguments fail before discovery: raw argument matrix (regression)
- Errors remain repairable and a corrected left scope excludes right: second call on same Tools instance in every matrix row (integration)
- Omitted, empty, dot and right scopes keep exact results: valid scope matrix (integration)
- Inclusion, containment and result bounds remain unchanged: retain and run existing tools tests and configured full Go checks (existing)
- Validation classifications and argument handling: add focused callable-interface validation tests alongside existing tools tests (unit)

## Feasibility
- evidence: {"id":"scope-observer","kind":"observer","inputs":["features/steps/l-invalid-discovery-scope__scope.js"],"observers":["features/steps/l-invalid-discovery-scope__scope.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/l-invalid-discovery-scope__scope.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/l-invalid-discovery-scope__scope.js bad","exit":1,"output":"rejected\n"}]}
