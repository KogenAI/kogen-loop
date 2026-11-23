# Pin DecodeTask rejection of unknown fields

Slug: task-decode-strict-fields
Model: not applicable — the change adds regression tests for stateless decoding
Acceptance:
- .kogen/intents/task-decode-strict-fields/acceptance.feature
- features/steps/task-decode-strict-fields__strict.js

This feature adds direct regression tests in `api/task_regression_test.go` that pin the strictness `api.DecodeTask` already documents: an unknown field is rejected. Three properties are pinned: (1) a task with an unknown top-level field is rejected and the error names that field; (2) a task with an unknown field inside a nested task object (`role`, `session`) is rejected; (3) a valid task with known nested fields still decodes with those values. Out of scope: any change to task decoding (`api/api.go`) or to CLI behavior. Only `api/task_regression_test.go` changes in production paths; the existing object-shape and trailing-data test stays.

Acceptance copies the `api` package of the checkout into a scratch module, checks that its tests pass on the real `DecodeTask`, then swaps `DecodeTask` for a deliberately wrong variant and requires the package tests to fail with a test assertion. It names no test the Build has to invent.

## Decisions
- The tests live in api/task_regression_test.go as new test functions beside the existing one, using the public api.DecodeTask only. (decision: D1, round 1) (evidence: api/task_regression_test.go; api/api.go) (source: request)
- Nested objects are the two Task fields of struct type, role and session; the nested tests cover both. (decision: D2, round 1) (evidence: api/api.go) (source: request)
- Acceptance judges the tests by mutating DecodeTask in a scratch copy of package api (variants: drop unknown fields, strict at top level only, unnamed error, reject every nested field) and requiring a test failure each time; the checkout's api.go is not touched. (decision: D3, round 1) (evidence: api/api.go) (source: request)

## Source comparison
- Addressed: request acceptance 1 (unknown top-level field rejected and named) maps to the scenarios with variants drop-unknown and unnamed-error.
- Addressed: request acceptance 2 (unknown nested field rejected) maps to the top-level-only variant.
- Addressed: request acceptance 3 (valid task with known nested fields decodes) maps to the reject-nested variant.
- Omitted by request: changes to api/api.go and CLI behavior.

## Tests
- Unknown top-level field is rejected and named: TestDecodeTaskRejectsUnknownTopLevelField in api/task_regression_test.go (regression)
- Unknown nested field is rejected: TestDecodeTaskRejectsUnknownNestedField in api/task_regression_test.go (regression)
- Known nested fields still decode: TestDecodeTaskAcceptsKnownNestedFields in api/task_regression_test.go (regression)

## Feasibility
- none
