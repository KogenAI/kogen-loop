# Tell the agent to finish when its checks pass

Slug: l-stop-at-green
Model: not applicable — appending one sentence to a constant instruction text has no meaningful state
Acceptance:
- .kogen/intents/l-stop-at-green/acceptance.feature
- features/steps/l_stop_at_green.js

Fix L-STOP-AT-GREEN (change_type: fix; Studio kogen-loop issue 3d82ba29, research hill-climb confirmed 31 Oct 2026): after its checks pass, the agent spends extra turns re-reading files, re-running checks and polishing before calling finish. Append exactly one sentence to `loop.DefaultInstructions` in loop/session.go, after the existing last sentence and separated from it by one space, as in the published l3.diff:

`When your checks pass, call finish right away: no extra re-reads, re-runs or polishing after a pass.`

The complete resulting text of `loop.DefaultInstructions` is exactly:

`You are a coding agent. Work in the working directory with the tools you are given. Read what you need, make the changes the task asks for and check your work with the available tools. When you are done, call the finish tool with a summary of what you did. Your finish is a claim: the caller verifies the work independently, so say plainly what you did not check or could not do. When your checks pass, call finish right away: no extra re-reads, re-runs or polishing after a pass.`

No other instruction text changes: the first four sentences, `TerminalDefinition`'s description, tool descriptions and every other model-facing text stay byte-identical. A Session (and the CLI) whose task names instructions keeps sending those instructions unchanged; only the default (empty `instructions`) gains the sentence. Finish stays a claim: Kogen's independent verification and review are unchanged, and nothing in this library starts treating a finish as proof. No new command, flag, option or limit. Keep the source gofmt-formatted (the published diff's `"+` lacks the space gofmt adds).

Update any test or golden text that pins the default instructions (repository search found no golden file containing the text; conformance/library_test.go `TestSessionDefaultsAreTheGenericTools` checks it only for the words `finish` and `claim`), and add a CHANGELOG.md bullet under `## v0.1.0 (unreleased)` noting the change and its evidence (below). Docs that only say `"": DefaultInstructions` need no change. All configured checks (go-format, go-test, go-vet, go-build) must pass.

Evidence to record in CHANGELOG.md (summarize faithfully; do not add claims): 24 paired blocks (12 Go tasks, two repetitions, gpt-6.1-terra high): with the added sentence, wall time was lower in 21/24 (sign p=0.0003, ratio 0.83), cost ratio 0.79-0.83, requests 0.78-0.80; all 48 runs passed the hidden graders in both arms. Two other candidate sentences (combined checks, write once) were tested in the same design and dropped: no repeatable gain. Reproduction pack: https://github.com/KogenAI/kogen-bench/tree/880f9ec8ca7a9f176a6c808cefb7985794914e87/reproduce/loopnight-instruction-levers/README.md (patch patches/l3.diff, sha256 95702947201907f9580bf335ff5b1a8cd0f4dc2aad5223d29e9f9b8f66b3764f). loop main 98a02ab has the same DefaultInstructions text as the measured 8a2fcda.

## Decisions
- Append exactly `When your checks pass, call finish right away: no extra re-reads, re-runs or polishing after a pass.` as the final sentence of `loop.DefaultInstructions`, one space after the existing last sentence (source: request)
- No other instruction text changes; finish stays a claim and independent verification/review are unchanged (source: request)
- No new command, flag, option or limit (source: request)
- Note the change and its evidence in CHANGELOG.md (source: request)

## Source comparison
- Addressed: request What to change (exact sentence, loop/session.go, as in l3.diff) is the complete expected text in Decisions and acceptance.feature. The published l3.diff was retrieved during shaping from raw.githubusercontent.com at commit 880f9ec8ca7a9f176a6c808cefb7985794914e87; its bytes hashed to the stated sha256 95702947201907f9580bf335ff5b1a8cd0f4dc2aad5223d29e9f9b8f66b3764f and show the sentence appended to the last line with a single-space separator and no other text change.
- Addressed: request Acceptance evidence "default instructions end with exactly that sentence" is scenario 1 (ends-with, exactly-once and full exact text through a public Go consumer of loop.DefaultInstructions); "the request a fresh session sends contains it once" is scenario 2 (real `kogen-loop run` CLI, task `instructions: ""`, local fake ChatGPT Responses endpoint, exact `instructions` field and exactly one occurrence in the raw request body); "all configured checks pass" is Kogen's configured go-format, go-test, go-vet and go-build. Each acceptance step is bounded below the 120 s per-step limit (shaping run: about 5 s each).
- Addressed: request Must stay (finish stays a claim, no other instruction text changes) is enforced by the exact full-text assertions, which reject changes to any other sentence.
- Addressed: request Evidence and "loop main 98a02ab has the same DefaultInstructions text as the measured 8a2fcda" are retained above for CHANGELOG.md; HEAD 90a9d84 differs from 98a02ab only in .kogen/project.yaml, and loop/session.go currently holds the four-sentence text.
- Addressed: "Update any test or golden text that pins the default instructions": only conformance/library_test.go references the text; it is strengthened, not weakened.
- Omitted: no requested behavior omitted; no conflict or supersession.

## Tests
- Default instructions end with the stop-at-green sentence exactly once and otherwise keep the existing four sentences: extend `TestSessionDefaultsAreTheGenericTools` in conformance/library_test.go to compare `loop.DefaultInstructions` with the complete expected text (keeping its existing finish/claim and definitions assertions) (regression)
- A fresh standalone session sends the new default text once: acceptance scenario 2 runs the built CLI against a local fake provider and inspects the first request's `instructions` field and raw body (scenario)
- Explicit task instructions and all other request bytes stay as before: existing conformance and loop tests, run by the configured checks (existing)

## Feasibility
- none
