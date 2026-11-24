# Require exact JSON task field names

Slug: task-field-exact-case
Model: not applicable — each decode checks one input without persistent state.
Acceptance:
- .kogen/intents/task-field-exact-case/acceptance.feature
- features/steps/task-field-exact-case__steps.js
- features/steps/task-field-exact-case__driver/main.go

`api.DecodeTask(r io.Reader) (api.Task, error)` must refuse task fields whose spelling does not exactly match the defined JSON field name, in the top-level object and inside `role` and `session`. Compare the decoded JSON member name to the tag, not the raw escape spelling. On refusal return a zero `api.Task` and a non-nil error that identifies the offending name as supplied; no fixed wording or path is required. Exact names keep their current decoded values and types. This replaces case-insensitive field matching, not strict decoding: keep duplicate-member handling (including its precedence over schema checks), unknown-field and trailing-data refusal, and task validation after decoding unchanged. (evidence: api/api.go; api/task_regression_test.go; cmd/kogen-loop/main.go)

Build scope: `api/api.go`, `api/task_regression_test.go`, and `docs/contract/loop-v1.md`. State the exact-spelling rule in the caller contract’s Task section, including both nested objects. No CLI, protocol version, or schema changes. (evidence: docs/contract/loop-v1.md; cmd/kogen-loop/main.go)

Acceptance runs from the module root with the configured Node/Cucumber runner and Go 1.27.2. Each decode step passes its Doc String as UTF-8 on stdin to `go run ./features/steps/task-field-exact-case__driver`, which calls the public decoder. A normal driver response is one newline-terminated JSON object: `task` is the JSON-encoded `api.Task` and `error` is null on success; on refusal `task` is null and `error` is the Go error string. Compile, process, and JSON output failures are distinct from decoder refusal. The success assertion compares supplied fields semantically, preserving nested values and array order. The documentation step reads the Task section of the actual caller contract; its JSON example alone does not count as a rule. To preserve post-decode validation, build `go build -o <temporary executable> ./cmd/kogen-loop` and send the supplied lower-case task to that executable with `run --task -`. Assert process exit 2 and the JSON Lines `error` then `session.ended` events: `loop/invalid_task` with the scenario detail, then `failed` with exit 2. The root exists and the validation precedes provider access. No credentials or network are needed. (evidence: .kogen/project.yaml; go.mod; api/api.go; docs/contract/loop-v1.md)

## Decisions
- Require exact decoded JSON tag matches at the task root and in role and session, with a decode error naming the offending field. (decision: D1, round 1) (evidence: api/api.go; api/task_regression_test.go) (source: request)
- Apply the exact-name check after duplicate detection and before accepting typed input; leave value typing, trailing-data rejection and post-decode validation in place. (decision: D2, round 1) (evidence: api/api.go; api/task_regression_test.go; cmd/kogen-loop/main.go) (source: request)
- Document the exact-name requirement in the v1 caller contract’s Task section. (decision: D3, round 1) (evidence: docs/contract/loop-v1.md) (source: request)

## Source comparison
- Addressed: evidence `ev-0699750d` identifies the gap in `api/api.go` and `api/task_regression_test.go`. Request acceptance 1 maps to the root scenario: `Prompt` is refused and named, rather than being read as `prompt` by `DisallowUnknownFields` alone.
- Addressed: request acceptance 2 maps to the separate `role` and `session` refusals and the successful exact-spelling decode. A top-level-only check cannot satisfy the nested scenarios, and a parser that rejects valid nested names cannot satisfy the successful decode.
- Addressed: request acceptance 3 maps to the documentation scenario against `docs/contract/loop-v1.md`; a parser-only fix fails it.
- Superseded: acceptance of case variants of defined task field names. Intentionally unchanged: valid lower-case fields (the exact-name fixture), duplicate-member handling (the root scenario observes duplicate refusal before spelling checks), and task validation after decoding (the role scenario invokes the real CLI and observes the existing negative-deadline refusal). No requested behavior is omitted or in conflict.

## Tests
- Refuse and name a case variant at the root, in role, and in session: add three cases to a table-driven decoder test in `api/task_regression_test.go` beside the existing unknown-field tests (regression)
- Preserve the decoded values of exact lower-case fields: retain `TestDecodeTaskAcceptsKnownNestedFields` in `api/task_regression_test.go` (existing)
- Preserve object shape, trailing-data, unknown-field and duplicate-member refusal: retain `TestDecodeTaskRequiresExactlyOneObject`, `TestDecodeTaskRejectsUnknownTopLevelField`, `TestDecodeTaskRejectsUnknownNestedField` and `TestDecodeTaskRejectsDuplicateMembers` in `api/task_regression_test.go` (existing)
- Exercise refusal, named errors and successful exact-name decoding through the public decoder: run the three decode scenarios in `acceptance.feature` (scenario)
- Keep duplicate-member refusal ahead of schema checks: observe the existing duplicate diagnostic in the root scenario (scenario)
- Preserve validation after decoding: observe the existing CLI validation exit and events in the role scenario (scenario)
- Verify the caller can find the exact-name requirement in the Task section: run the caller contract scenario in `acceptance.feature` (scenario)

## Feasibility
- Go 1.27.2 ran the existing focused decoder tests successfully. The stdin driver on unchanged code decoded the three case variants normally with null errors; its Go source was formatted. Both probes exited 0.
- Scratch probes generated and aligned the correct and initial six wrong overlays. The first compile exposed the one-variable reflection field iterator; after correction the correct overlay compiled, passed the focused decoder tests, and its real driver returned errors naming each variant and preserved the exact-name input. Those six wrong patches applied in check mode over the correct overlay. Two further overlays address the preservation checks, with one redundant nested-only variant removed. The final probe exited 0.
- On unchanged code, the driver identified a repeated member before schema validation. The built CLI ran the lower-case fixture’s ordinary negative-deadline validation, exited 2, emitted `error` followed by `session.ended` on stdout, and emitted nothing on stderr. Both probes reached the real entry points.
- evidence: {"id":"decoder-observer","kind":"observer","inputs":["features/steps/task-field-exact-case__driver/main.go"],"observers":["features/steps/task-field-exact-case__steps.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/task-field-exact-case__steps.js good","exit":0,"output":"observer rejected 0 of 6\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/task-field-exact-case__steps.js bad","exit":1,"output":"observer rejected 6 of 6\n"}]}
