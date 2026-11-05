# Replace private mirror path in consumes Intent

Slug: l-public-tree-private-paths
Model: not applicable — a one-line text replacement in a committed Intent record; there is no state or interacting rule
Acceptance:
- .kogen/intents/l-public-tree-private-paths/acceptance.feature
- features/steps/l-public-tree-private-paths__public.js

kogen-loop is a public repository. The landed public-readiness Intent `l-public-ready` (d2dd2db, "Prepare public repository documentation") has an acceptance step in `features/steps/l_public_ready.js`, "tracked public documentation has no private identity or setup residues". That step scans the tracked `README.md`, `docs/` and `.kogen/intents/` files for home-directory paths, the private work directory, runner host names and personal names. A later Intent, cfa9b06 ("Cover all consumer uses and state no consumes"), added `.kogen/intents/l-consumes-contract/intent.md` line 35. That line names the consumer mirrors through a macOS home-directory path under the build runner's account, which also contains the runner host name. On the current tree that line is the step's only hit, so the `l-public-ready` scenario "Public documentation has no local identity residues" fails.

The fix replaces only the private directory part of that one line with the neutral placeholder `<mirrors>`. After the fix, line 35 of `.kogen/intents/l-consumes-contract/intent.md` is exactly:

`` Consumer sources, for reading the cases to adapt: Shape read them from local mirrors with `git --git-dir=<mirrors>/<consumer>.git show <commit>:<path>`. Acceptance does not use these mirrors, and the suite must not read them. ``

Every other byte of that file stays the same, including its other 67 lines and the final newline. The sentence still says that Shape read consumer sources from local git mirrors and that acceptance does not use them, and it no longer names a home path, a runner host or a personal name.

Boundaries (unchanged scope of the landed public-readiness work: README, documentation and committed Intent records only):
- `features/steps/l_public_ready.js` and `.kogen/intents/l-public-ready/acceptance.feature` are not edited. No pattern, path filter or assertion is weakened.
- `features/steps/standalone_loop.js` and `features/steps/l_parallel_tests_sys.js` still hold local paths. The landed `l-public-ready` Intent explicitly exempts them from current-tree path cleanup, so they are not touched.
- `.kogen/project.yaml`, Go code, tests, `README.md` and `docs/` are not changed. No other Intent record changes.
- Git history is not rewritten. The fix is one ordinary new commit on top of the current branch, so earlier commits, including d2dd2db and cfa9b06 where the private line was added, stay as they are.

## Decisions
- Keep the landed public-readiness scope: README, documentation and committed Intent records only. `.kogen/project.yaml`, the two exempt step files and git history are not touched (source: request)
- The private mirror directory becomes the placeholder `<mirrors>`, so the command reads `git --git-dir=<mirrors>/<consumer>.git show <commit>:<path>`. This is the example the request gives (source: request)
- No other text, test or assertion changes, and `features/steps/l_public_ready.js` is not edited (source: request)

## Source comparison
- Addressed: "Replace the private path in the `l-consumes-contract` Intent record with a neutral placeholder (for example `<mirrors>/<consumer>.git`) and keep what the sentence says." Scenario "The consumer-contract Intent record names its mirrors with a neutral placeholder" requires the exact line above, the absence of every residue pattern from the file, and the sha256 of the whole expected file (the current file with only line 35 replaced).
- Addressed: acceptance 1, "the `l-public-ready` scenario (all of its steps) passes; in particular the residue step reports no file". Scenario "The landed public-readiness acceptance passes without changing its check" runs `.kogen/intents/l-public-ready/acceptance.feature` through the real Cucumber runner (`$KOGEN_NODE`, `$KOGEN_CUCUMBER/@cucumber/cucumber/bin/cucumber.js --strict`), loading only `features/steps/l_public_ready.js`. It requires that every step of all three scenarios passed and that the runner exited 0. On the current tree, that run reports "Public documentation has no local identity residues" as failed, with the residue message naming `.kogen/intents/l-consumes-contract/intent.md`.
- Addressed: acceptance 2, "still says that shaping read consumer sources from local git mirrors and that acceptance does not use them, with no home path, runner host or personal name in it". This is covered by the exact-line step and the residue-pattern step on that file.
- Addressed: acceptance 3, "No assertion is weakened, and `features/steps/l_public_ready.js` is not edited". The first scenario pins the sha256 of `features/steps/l_public_ready.js` and `.kogen/intents/l-public-ready/acceptance.feature` to their current bytes. The configured checks go-format, go-test (which includes `./conformance`), go-vet and go-build run unchanged as Kogen's configured checks. `.kogen/project.yaml` is protected by the automatic baseline.
- Addressed: "the two exempt step files ... are not touched". Their sha256 digests are pinned to the current bytes.
- Addressed in prose, not in executable acceptance: acceptance 4, "Git history is not rewritten". Kogen runs acceptance in a fresh single-commit copy with no earlier commit objects, so an ancestry check cannot run there; a first candidate's `git merge-base --is-ancestor` step failed in that copy with "Not a valid commit name". The guarantee is that the fix lands as one ordinary new commit.
- Omitted on purpose: the original private path is not repeated in this record or its feature, because this directory is itself under `.kogen/intents/` and the residue step scans it.
- Shaping evidence: a direct run of the `l-public-ready` feature with only `features/steps/l_public_ready.js`, on the unchanged tree, printed `3 scenarios (2 passed, 1 failed)` and exited 1. Its message stream gave the step statuses PASSED, PASSED / FAILED, SKIPPED / PASSED, PASSED. The residue patterns, applied with `git grep` over README.md, docs and .kogen/intents, hit only line 35 of the `l-consumes-contract` record. No Feasibility obligation is declared. The nested-run observer reads real runner messages, and the baseline red already exercises both its passed and its failed paths.

## Tests
- The `l-consumes-contract` Intent record names its mirrors with the `<mirrors>` placeholder, keeps the sentence and changes no other byte: acceptance scenario "The consumer-contract Intent record names its mirrors with a neutral placeholder" (regression)
- The landed `l-public-ready` acceptance, all three scenarios and every step, passes on the landed tree with its check and exemptions unchanged: acceptance scenario "The landed public-readiness acceptance passes without changing its check" (regression)
- Go format, tests, vet and build are unaffected by a documentation-only edit: configured checks go-format, go-test, go-vet and go-build (existing)

## Feasibility
- none
