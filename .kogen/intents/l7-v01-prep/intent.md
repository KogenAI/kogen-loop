# Prepare the v0.1 development release

Slug: l7-v01-prep
Model: not applicable — documentation and a constant have no meaningful state transitions
Acceptance:
- .kogen/intents/l7-v01-prep/acceptance.feature
- features/steps/l7_v01_prep.js

Prepare L7, the DELIVERY row for kogen-loop v0.1 queued after L1-L5, for the 28 October night work on main. Add a truthful CHANGELOG and current README status and a single exported `loop.Version` constant equal to `0.1.0-dev`. This prepares, but does not create, a tag or publish anything. No behavior, protocol or API changes except that identifier. Keep all existing tests and conformance passing. Do not modify Kogen, its vendor copy or pin.

## Decisions
- Use `CHANGELOG.md` heading `## v0.1.0 (unreleased)` and exactly the eleven commit bullets specified in acceptance, in request order; each bullet is the short hash followed by the exact git subject. Do not add other delivered-capability bullets or invent features. (source: request)
- Update README Local status and compatibility and all other stale current-status sentences, retaining provenance as clearly dated history. Retain the 27 October 2026 baseline, its hashes, pin, digest and initial-adoption qualifications. Current status is dated 28 October 2026: Kogen adopted the caller-owned shell bound in `8793a7f`; `c7e8331` fixed two Linux flakes and both tests were proved 50/50 on eu2. These integration/runtime facts are supplied by the request, not newly reproduced here. Do not imply that cross-builds prove lifecycle behavior. (source: request)
- Remove the present-tense claim that the shell bound is not adopted by Kogen. The earlier pending Linux proof may remain only as explicitly dated 27 October history, followed by the current result. Preserve technical limitations and library-only/no CLI setting semantics. (source: request)
- No tag, publication, global installation or runtime switch. Shared-host safety: never stop processes by name or pattern, only pids started by this work; no synthetic CPU load; temporary artifacts only in temp directories. (source: request)

## Source comparison
- Addressed: request CHANGELOG list maps exactly to the eleven ordered lines in acceptance; real subjects were read with git log from the repository git directory (scratch copies omit .git). Additional log entries, including Linux observation repair, are deliberately omitted from the changelog capability list because the request says exactly the listed commits.
- Addressed: request README corrections replace README line 29's current unadopted statement and qualify its pending-proof history; acceptance requires dated current adoption and Linux proof text. README lines 62–64 remain historical provenance, not current pin assertions.
- Addressed: requested single version identifier uses `loop.Version = "0.1.0-dev"`; a new Go test compares it with CHANGELOG's unreleased base version plus `-dev`. Acceptance checks the public identifier and runs that named test. The production version file and Go test are builder-owned, not Acceptance-protected.
- Addressed: request no behavior/API/protocol changes except the identifier, full configured checks, existing tests, conformance and no tagging/publishing remain delivery requirements. No scope is superseded beyond stale README current-status wording; no requested capability is omitted.

## Tests
- Exact unreleased changelog commits and real subjects: compare ordered section bullets with feature expectations derived from git log (integration)
- Dated current README adoption and Linux proof with retained historical provenance: inspect rendered Markdown source text and review all status sentences for truthfulness (integration)
- Public development version matches unreleased changelog: add `loop.TestVersionMatchesChangelog`, reading `../CHANGELOG.md` and comparing its unreleased version plus `-dev` to `Version`; acceptance also checks `go doc kogen-loop/loop.Version` (unit)
- Unchanged runtime and protocol: configured go-format, go-test, go-vet and go-build plus `go test -race ./...` and `go test ./conformance -count=1` (existing)

## Feasibility
- Initial scratch git log failed because scratch has no .git; no subjects were inferred from that failure. Read-only `git --git-dir=/Users/kogen-runner/src/l7/.git log -20 --format='%h %s'` succeeded and supplied all eleven exact subjects. No external technical dependency or risky generated fixture is needed. (probe 2: exit 0, 0.0 s)
