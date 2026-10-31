# Record later changes in commit history

Slug: l-changelog-from-commits
Model: not applicable — a documentation and convention change with no runtime state
Acceptance:
- .kogen/intents/l-changelog-from-commits/acceptance.feature
- features/steps/l_changelog_from_commits.js

A kogen-loop change no longer edits a shared changelog file. Instead, the change's own commit message (subject and body) is the record. This is a fix (change_type: fix). Today almost every change adds an entry to `CHANGELOG.md`: 15 of the last 20 commits on main touched it. When Builds run in parallel, the one that lands second conflicts on that file even when the code does not overlap, so a green, reviewed Build has to be rebuilt. Evidence from 31 Oct 2026 (main moving 733b50d -> 99d858a -> b998f2a -> 98a02ab): L-REQUEST-BUDGET green 4ac55b9 (Build 37ecba2d) on 733b50d conflicted only in CHANGELOG.md when cherry-picked onto b998f2a and was rebuilt. L-PARALLEL-TESTS green 734a2f3 (Build ac6c5cdd) on 733b50d conflicted in CHANGELOG.md plus two test files and was rebuilt. Kogen and Studio keep no CHANGELOG.md; their commit log is their history.

What changes:

1. `CHANGELOG.md` gets one new paragraph between the `# Changelog` title and the `## v0.1.0 (unreleased)` heading. The paragraph says that the file is no longer updated and that later changes are recorded in the commit history. The file must begin with exactly these bytes (a blank line separates each part; the file continues straight after the heading's newline):

   `# Changelog` + blank line + the note paragraph below as one line + blank line + `## v0.1.0 (unreleased)`

   The exact note line:

   This file is no longer updated. Its entries end with commit `07f21da` (Continue runs within the request budget). Later changes, and earlier ones not listed below, are recorded in the commit history: each commit's subject and body state what changed, and a `Kogen-Intent: <slug>` trailer names the change's full description in `.kogen/intents/<slug>/intent.md`. List them with `git log`.

   Everything from the `## v0.1.0 (unreleased)` line to the end of the file stays byte for byte as it is now: 10538 bytes, sha256 `3b30310ebfa2c0a30cd786f887c9a846e4a688063d69b2c7f8bc19ee8ee83e64`, the same 25 entries in the same order, and the trailing newline. No entry is added for this change and no entry is reworded. The heading stays, so `loop.TestVersionMatchesChangelog` and the `loop/version.go` comment stay valid. The note uses no fenced code block and none of the removed-lever names, so `conformance.TestQueuedLeverCleanup` and `conformance.TestDropBoundsDocumentation` keep passing unchanged.

2. `README.md`, section "Local status and compatibility":
   - In the "Current status, 28 October 2026" paragraph, replace `see the [CHANGELOG](CHANGELOG.md) for the unreleased v0.1.0 contents;` with `see the [CHANGELOG](CHANGELOG.md) for the unreleased v0.1.0 contents up to commit `07f21da`, and the commit history for later changes;`. The rest of that paragraph stays unchanged.
   - Directly after that paragraph, add this new paragraph, which is the repository instruction for future changes: `Changes are recorded in their commit messages, not in CHANGELOG.md: a change does not add a CHANGELOG.md entry; its commit subject and body state what changed.`

Boundaries: no new command, flag, option, script or generator, and no release, tag or publish step. No Go source, Go test or configured check changes. Kogen, its vendored copy and its pin are not modified. Historical intents under `.kogen/intents/` and earlier step files such as `features/steps/l7_v01_prep.js` are historical records and stay unchanged. The commit messages themselves are produced by Kogen and are outside this repository. All configured checks (go-format, go-test, go-vet, go-build) must pass. Each acceptance step runs within 120 s.

## Decisions
- A change no longer edits a shared changelog file; its commit subject and body are the record (source: request)
- CHANGELOG.md keeps its existing history readable and unchanged and says plainly that later changes are recorded in the commit history, with no release or tag step and no generator (source: request)
- The note is placed at the top of CHANGELOG.md, before the unreleased heading, so a reader sees it first (source: request)
- Repository instructions say a change does not add a CHANGELOG.md entry: README.md gets the new convention paragraph and the updated status sentence (source: request)

## Source comparison
- Addressed: "A change no longer has to edit a shared changelog file": the README convention paragraph and the CHANGELOG note. Acceptance checks both, and the history hash rejects an added entry for this change.
- Addressed: "existing CHANGELOG.md history stays readable; the file says plainly that later changes are recorded in the commit history": acceptance checks the exact note prefix and the byte-identical history (sha256 above).
- Addressed: "Repository instructions, contract docs and any test that requires a CHANGELOG entry per change are updated". README.md is the only repository instruction that mentions the changelog. `docs/contract/loop-v1.md`, `docs/testing-rules.md` and `features/steps/README.md` do not mention it. Three Go tests read CHANGELOG.md: `loop.TestVersionMatchesChangelog` needs the `## v0.1.0 (unreleased)` heading, and `conformance.TestDropBoundsDocumentation` and `conformance.TestQueuedLeverCleanup` need the existing removal entries and no fenced code block. None of them requires a per-change entry, so they stay unchanged, and acceptance runs them by name. `features/steps/l7_v01_prep.js` pins an old 11-entry list for the historical L7 acceptance. It is not part of any configured check and stays unchanged.
- Omitted by request: producing a changelog from commit messages on demand. The request makes this an alternative ("or") and adds no new command, flag or option.
- Observed, not changed: recent commit bodies on main often carry only the `Kogen-Intent:` trailer (for example 07f21da, 98a02ab, b998f2a, 99d858a), while some carry prose (c4308cb). The note therefore also points to the trailer's intent file.
- Preserved literals: slug L-CHANGELOG-FROM-COMMITS; filing date 31 Oct 2026; commits and Builds 733b50d, 99d858a, b998f2a, 98a02ab, 4ac55b9, 37ecba2d, 734a2f3, ac6c5cdd; "15 of the last 20 commits"; the 120 s per-step limit; no release, tag or publish step.

## Tests
- CHANGELOG.md states where later changes are recorded and keeps its history byte for byte with no new entry: acceptance scenario checking the exact file prefix and the sha256 and byte count of the history section (scenario)
- README.md tells changes not to add a CHANGELOG.md entry and points later status to the commit history: acceptance scenario checking the two exact new texts and the absence of the old status phrase (scenario)
- The configured tests that read CHANGELOG.md still pass with the note and without a per-change entry: acceptance runs `go test ./loop ./conformance -run '^(TestVersionMatchesChangelog|TestDropBoundsDocumentation|TestQueuedLeverCleanup)$' -count=1 -v` and requires each named test to pass; the go-test check runs them as well (existing)

## Feasibility
- none
