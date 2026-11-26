# Cover event envelope collisions

Slug: event-envelope-collision-guard
Model: not applicable — encoding is a stateless transformation of one event.
Acceptance:
- .kogen/intents/event-envelope-collision-guard/acceptance.feature
- features/steps/event-envelope-collision-guard__steps.js
- features/steps/event-envelope-collision-guard__driver/main.go

Add focused Go tests in `api/event_test.go` that call `api.Event.MarshalJSON() ([]byte, error)` directly. The application scope is `api/api.go` and `api/event_test.go`; only the test file needs to change. The method already implements the guard and the flattened encoding (evidence: api/api.go). Preserve both, including the existing collision error message. Nothing in production is replaced or removed.

Use a populated `api.Event` with a `map[string]any` for `Fields`. Test one encodable conflicting field per call, so the collision alone determines the error. Test each of the four reserved names independently. For ordinary fields, require a nil error and compare the decoded JSON object to the complete expected top-level object, including envelope and ordinary values with their JSON types. Member order and whitespace are not part of the test.

Acceptance runs from the module root using the configured Node/Cucumber runner and Go 1.27.2 (evidence: .kogen/project.yaml; go.mod). The acceptance-only command `go run ./features/steps/event-envelope-collision-guard__driver` reads a UTF-8 JSON object from stdin with the event envelope and a `fields` object and calls the method directly. Its stdout has one newline-terminated JSON object with `json` (returned bytes as a string) and `error` (the error string or null). A method error is reported as JSON with exit zero, not as a process failure (evidence: ran `printf '%s\n' '{"fields":{"seq":2}}' | go run ./features/steps/event-envelope-collision-guard__driver`). This is the test bridge format, not a product protocol. The scenarios check the error text or parse and compare the successful JSON. They exercise preserved behavior, so they should pass on the unchanged tree; the Build must still add the direct Go tests. The wrong-implementation overlays show what the assertions must catch without requiring a production edit.

Run `go test ./api -run '^TestEventMarshalJSON' -count=1` during implementation, then the configured project checks and acceptance (evidence: .kogen/project.yaml).

## Decisions
- A field named `protocol`, `seq`, `time`, or `type` makes `Event.MarshalJSON` return an error naming the colliding field. Keep the existing message `event field %q collides with the envelope` unchanged. (evidence: api/api.go) (source: request)
- Ordinary fields marshal beside the `protocol`, `seq`, `time`, and `type` envelope values in one JSON object. Keep the current flattened event format unchanged. (evidence: api/api.go; docs/contract/loop-v1.md) (source: request)
- Add coverage in `api/event_test.go` at the public method boundary; leave `api/api.go` unchanged because it already satisfies both requirements. (evidence: api/api.go; api) (source: request)

## Source comparison
- Addressed: `ev-f17f0e16` identifies the guard in `api/api.go` and the missing direct collision coverage. Acceptance 1 maps to the four collision scenarios and the Go regression table in Tests. Each scenario asserts the existing field-specific error; the silent-overwrite variants would return nil errors instead.
- Addressed: acceptance 2 maps to “Keep ordinary fields at the top level” and the Go flattened encoding test in Tests. The complete object comparison rejects both blanket refusal and nesting, and verifies envelope values are retained.
- Neither acceptance behavior is omitted, conflicting, or superseded. The only change is coverage; changes to encoding, error wording, or application paths outside the supplied scope remain excluded.

## Tests
- Refuse each envelope collision with its existing field-specific error: add `TestEventMarshalJSONRejectsEnvelopeCollisions` in `api/event_test.go` with a subtest for each reserved key (regression)
- Encode ordinary fields alongside the envelope: add `TestEventMarshalJSONFlattensOrdinaryFields` in `api/event_test.go` and compare the decoded result to the complete expected object (unit)
- Verify the same outcomes through the public method without relying on new test files: run the configured acceptance feature (scenario)

## Feasibility
- Baseline API tests passed with Go 1.27.2; Node was available (probe: exit 0, 0.4 s).
- The formatted bridge returned the four field-specific errors and the successful flat object on unchanged production code (probe: exit 0, 0.7 s). A separate collision probe confirmed exit zero with the JSON result (probe: exit 0, 0.4 s).
- The scratch correct overlay added only Go tests. The focused run executed both tests and all four collision subtests; each of the seven wrong overlays caused a Go assertion failure (probe: exit 0, 3.1 s).
- evidence: {"id":"event-observer","kind":"observer","inputs":["features/steps/event-envelope-collision-guard__driver/main.go"],"observers":["features/steps/event-envelope-collision-guard__steps.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/event-envelope-collision-guard__steps.js good","exit":0,"output":"observer rejected 0 of 3\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/event-envelope-collision-guard__steps.js bad","exit":1,"output":"observer rejected 3 of 3\n"}]}
