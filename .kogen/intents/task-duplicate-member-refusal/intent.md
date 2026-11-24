# Reject duplicate task member names

Slug: task-duplicate-member-refusal
Model: not applicable — task decoding is a stateless validation and conversion of one input.
Acceptance:
- .kogen/intents/task-duplicate-member-refusal/acceptance.feature
- features/steps/task-duplicate-member-refusal__steps.js
- features/steps/task-duplicate-member-refusal__driver/main.go

`api.DecodeTask(r io.Reader) (api.Task, error)` must reject duplicate member names at any object depth and identify the offending key in the error instead of silently decoding an ambiguous task. Check names within each JSON object, including objects reached through arrays. Compare decoded, case-sensitive names, not their escape spellings. Refusal returns a zero `api.Task` and a non-nil error; no exact new wording, path, or list of all duplicates is required.

A duplicate in the first syntactically complete object is a structural error, even if its surrounding value would also fail a schema check. A duplicate-free object continues through the same typed decode, unknown-field checks and trailing-data check; malformed/non-object input retains its existing refusal. If the first object would otherwise be accepted, extra data still yields the existing trailing-data error. Unique, known nested fields and surrounding whitespace remain accepted with their values intact. The implementation scope is only `api/api.go` and `api/task_regression_test.go`. Task fields, JSON types, unknown-field and trailing-data handling on duplicate-free input, and CLI protocol validation are unchanged.

Acceptance runs from the module root under the configured Node/Cucumber runner (evidence: .kogen/project.yaml) and uses Go 1.27.2 (evidence: go.mod). The offline command `go run ./features/steps/task-duplicate-member-refusal__driver` feeds each Doc String as raw UTF-8 bytes on stdin to the real `api.DecodeTask`; the whitespace step adds a space/newline and a tab/newline around it. The driver emits one newline-terminated JSON object: `task` contains the JSON-encoded `api.Task` and `error` is null on success; `task` is null and `error` is the Go error string on refusal. Both are normal driver responses, distinct from build or execution failures. The observer compares field values semantically, preserving array order, or checks the error string. No credentials, session creation, or provider requests are involved.

## Decisions
- DecodeTask must reject duplicate member names at any object depth and identify the offending key in the error. (evidence: api/api.go) (source: request)
- Treat duplicate names as a property of the first complete JSON object, before applying the task schema; preserve the existing strict decode and trailing-data rules for duplicate-free input. (evidence: api/api.go; api/task_regression_test.go) (source: request)
- Exercise the public decoder directly without changing the CLI or depending on tests that do not yet exist. (evidence: api/api.go; cmd/kogen-loop/main.go) (source: request)

## Source comparison
- Addressed: request evidence `ev-d2dd058e` points to `api/api.go` and `api/task_regression_test.go`. The two-`prompt` scenario replaces silent last-value acceptance with a refusal naming `prompt` (acceptance 1).
- Addressed: the repeated `model` and `dir` scenarios pin the key-specific refusal in `role` and `session` (acceptance 2). The below-array and escaped-spelling scenarios pin the meaning of "at any object depth" and "member names" without allowing new field types.
- Addressed: the known-fields scenario checks successful decoding with surrounding whitespace, and the unknown-field and trailing-data scenarios preserve the corresponding refusals (acceptance 3). The controls separately challenge last-value wins, top-level-only checking, omitted key diagnostics, invalid refusal of a valid task, and bypassed strict checks.
- Superseded: duplicate-bearing input is no longer decoded as an ordinary task. No requested behavior is omitted or in conflict. Task fields and JSON types, the existing unknown-field/trailing-data behavior, CLI behavior outside `DecodeTask`, and changes outside the requested implementation paths remain out of scope.

## Tests
- Reject and name a duplicate at the task root and inside role or session: add table-driven DecodeTask regression cases in `api/task_regression_test.go` (regression)
- Detect the same decoded name despite JSON escapes and walk through arrays to deeper objects: include cases in the new DecodeTask regression table (regression)
- Decode a unique task with known nested fields and surrounding whitespace: extend `TestDecodeTaskAcceptsKnownNestedFields` to combine the two conditions and assert the decoded values (regression)
- Keep refusing unknown top-level and nested fields: retain `TestDecodeTaskRejectsUnknownTopLevelField` and `TestDecodeTaskRejectsUnknownNestedField` (existing)
- Keep refusing a non-object or trailing data: retain `TestDecodeTaskRequiresExactlyOneObject` (existing)
- Exercise the requested behavior through `api.DecodeTask`: run `acceptance.feature` with the configured Cucumber command (scenario)

## Feasibility
- The baseline DecodeTask tests pass on Go 1.27.2. The bridge on unchanged code returned `"error":null` and `"prompt":"last"` for escaped duplicate input. The scratch correct overlay named the duplicated key below an array and did not accept the corresponding duplicate-free wrong JSON type. The correct patch and all seven alternative patches applied in scratch; they are controls, not production edits.
- evidence: {"id":"decoder-observer","kind":"observer","inputs":["features/steps/task-duplicate-member-refusal__driver/main.go"],"observers":["features/steps/task-duplicate-member-refusal__steps.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/task-duplicate-member-refusal__steps.js good","exit":0,"output":"observer rejected 0 of 3\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/task-duplicate-member-refusal__steps.js bad","exit":1,"output":"observer rejected 3 of 3\n"}]}
