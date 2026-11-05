# Report stale wire golden keys and first diff path

Slug: fix-l-contract-wire-goldens
Model: not applicable — a test-only diagnostic change; the golden comparison is a stateless walk of two decoded JSON values
Acceptance:
- .kogen/intents/fix-l-contract-wire-goldens/acceptance.feature
- features/steps/fix-l-contract-wire-goldens__gate.js

An automated review of the landed l-contract-wire-goldens commit (P2) found two gaps in `TestProviderWireGoldens` (`contract/provider_wire_golden_test.go`). Both reproduce on main (HEAD c7afbda):
- Removed routes or variants leave stale fixture keys that nothing checks. With an extra key `tools/retired/tools=true` added to a scratch copy of `contract/testdata/loop_knobs_golden.json`, `go test ./contract -run '^TestProviderWireGoldens$' -count=1 -v` still passes all 18 subtests and the parent test. The test only looks up the keys its cases produce and never asserts that every fixture key is one of them.
- A mismatch dumps the full blobs with no path to the difference. With `baseline/anthropic` `messages[0].content[0].text` changed to `"bye"`, the failure is `baseline/anthropic body mismatch` followed by the whole compact rendered body and the whole indented golden body, with nothing pointing at the differing value.

The fix changes only `contract/provider_wire_golden_test.go`. The fixture `contract/testdata/loop_knobs_golden.json`, the route list, the variants, the request inputs, the case names and all production code stay unchanged. The test keeps passing on main's committed fixture.

1. Every fixture key must be visited. The case list is the six routes × the three variants (`baseline`, `tools=false`, `tools=true`), giving the 18 keys the test produces now. After the subtests, the parent test reports each fixture key that no case produces, in ascending byte order of keys, with `t.Errorf` and exactly this message: `stale golden key <key> is not visited by any route or variant`. "Visited" means produced by the case list, not that the subtest ran in this process. So a `-run` filter that selects only some subtests (for example `-run '^TestProviderWireGoldens$/^baseline$/^chatgpt$'`) reports no stale keys and passes. The existing `missing golden <key>` failure for a case without a fixture key stays.
2. A mismatch reports the first differing path. The current `<key> body mismatch\n got: …\nwant: …` report is removed. A subtest whose decoded rendered body (`got`) and decoded golden body (`want`) differ reports exactly one `t.Errorf` message on one line: `<key> body differs at <path>: got <got value>, want <want value>`.
   - Path syntax: the root is `$`, an object member adds `.<name>` (the name as is), an array element adds `[<index>]` (0-based). Example: `$.messages[0].content[0].text`.
   - The first difference is found by a depth-first walk of both decoded values from `$`. When both values are objects, visit the union of their member names in ascending byte order. When both are arrays, visit indices 0 to max(len)−1 in order. A member or index present on only one side is the difference at its own path. Otherwise, a pair of unequal values (different JSON kinds, or unequal scalars) is the difference at the current path.
   - Each value is printed as the compact `encoding/json.Marshal` output of the decoded value (so object members appear in sorted order), and a side that lacks the member or index is printed as `<missing>`. Examples: `got "hi", want "bye"`; `got ["reasoning.encrypted_content"], want <missing>`; `got <missing>, want {"user_id":"x"}`.
   - Equal bodies report nothing. Only the first difference is reported, and the full bodies are no longer printed.

Rules 1 and 2 fix the technical details the request leaves to shaping: visited keys come from the case list, stale keys are reported in sorted order with one message each, and rule 2 sets the path syntax, the walk order and the value format.

## Decisions
- The request's first step, showing the gaps on current main, holds for both findings (see the reproductions above). So the request's "does not reproduce" stop branch does not apply, and the fix is made. (source: request)
- Fail on every fixture key that no route or variant visits, so that stale keys left by removed routes or variants fail the test. (source: request)
- Replace the full-blob dump with a report of the first differing path. (source: request)

## Source comparison
- "Removed routes or variants leave stale fixture keys that nothing checks": addressed by rule 1. Acceptance scenario 1 adds a stale key for a removed route (`baseline/retired`) and one for a removed variant (`tools/chatgpt/tools=auto`) to a scratch copy, and requires both stale-key messages in sorted order, with all 18 subtests still passing.
- "A mismatch dumps the full blobs with no path to the difference" / "Report the first differing path": addressed by rule 2. Scenarios 2–4 cover a nested value, the first of several differences, a missing array element and a missing member, each with exactly one message per failing case.
- "First show it … on current main": both findings reproduce on HEAD c7afbda, as shown in the prose and in Feasibility. Scenarios 1–4 fail on main for these reasons: the stale-key run passes, and each mismatch prints `<key> body mismatch` plus the blobs instead of the path message.
- "If that does not hold, stop and report that it does not reproduce": not applicable, because it holds.
- "Fix it so the test fails on the broken behaviour and passes on main": scenarios 1–4 require it to fail on the broken fixtures. Scenarios 5–6 require the committed fixture to pass, both in the whole run (18 subtests) and in a run filtered to one case.
- "Keep every existing test green; no unrelated changes": only `contract/provider_wire_golden_test.go` changes. The fixture, the provider package, other contract tests and production code are unchanged, and the configured go-format, go-test, go-vet and go-build checks remain.

## Tests
- A fixture key that no route or variant visits fails TestProviderWireGoldens with `stale golden key <key> is not visited by any route or variant`, in sorted key order: acceptance scenario 1 runs the real `go test ./contract` on a scratch copy with two stale keys (regression)
- A body mismatch reports exactly one `<key> body differs at <path>: got <got>, want <want>` line for the first difference in walk order, with `<missing>` for a one-sided member or element: acceptance scenarios 2, 3 and 4 run the real test on scratch copies with mutated golden bodies (regression)
- The committed fixture still passes, also when `-run` selects a single case: acceptance scenarios 5 and 6 run the real test in the working tree (existing)

## Feasibility
- Repository inspection: the golden test, its fixture (18 keys = 6 routes × 3 variants, so main has no stale key) and the step conventions of earlier Intents. No external protocol, provider or library fact is involved, so no documentation lookup was needed.
- Reproduction on a scratch copy of HEAD c7afbda (Go 1.27.2): adding the key `tools/retired/tools=true` left `go test ./contract -run '^TestProviderWireGoldens$' -count=1 -v` passing (`ok github.com/KogenAI/kogen-loop/contract`). Changing the `baseline/anthropic` text to `"bye"` failed with `baseline/anthropic body mismatch` and the two whole bodies, and no path. (exit 0 and exit 1, about 1 s each)
- `go test ./contract -run '^TestProviderWireGoldens$/^baseline$/^chatgpt$' -count=1 -v` on the unchanged tree runs exactly one subtest, `TestProviderWireGoldens/baseline/chatgpt`, and passes (exit 0). This is the filter of scenario 6.
- The observer runs real `go test -v` output through a stub `TestProviderWireGoldens` in a scratch copy, which reports chosen messages. It accepts every expected outcome and rejects the old behaviour (stale keys green, the full-blob report) and plausible wrong ones (all paths reported, a later path first, another path notation, `null` for a missing side, the blob kept, a route dropped, a filtered run reporting stale keys). The good and bad controls each took under 10 s in a scratch copy.
- evidence: {"id":"wire-golden-observer","kind":"observer","inputs":["features/steps/fix-l-contract-wire-goldens__gate.js"],"observers":["features/steps/fix-l-contract-wire-goldens__gate.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/fix-l-contract-wire-goldens__gate.js --control good","exit":0,"output":"wire golden observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/fix-l-contract-wire-goldens__gate.js --control bad","exit":1,"output":"wire golden observer rejected\n"}]}
