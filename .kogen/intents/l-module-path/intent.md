# Publish the canonical Go module path

Slug: l-module-path
Model: not applicable — a stateless import-path migration
Acceptance:
- .kogen/intents/l-module-path/acceptance.feature
- features/steps/l-module-path__checks.js

Deliver L-MODULE-PATH: change `module kogen-loop` to `module github.com/KogenAI/kogen-loop`. Replace every self-package import `kogen-loop/...` with `github.com/KogenAI/kogen-loop/...`, including tests, testdata programs, generated files, docs and scripts (approximately 97 Go files). Include embedded source fixtures, path-sensitive package expectations and linker directives. Nothing else changes: no behavior change, no API change beyond the path, no added dependencies or replace directives. Keep useful existing tests.

## Decisions
- Preserve runtime protocol identifiers such as `kogen-loop/v1`, executable names, relative filesystem paths and historical facts; they are not module imports. Where Go string literals for the protocol match the requested grep, use equivalent constant concatenation such as `"kogen-loop" + "/v1"` to preserve the value while satisfying the literal scan. (source: request)
- Preserve the main, 4 Nov order: this lands first. One consumer row per repo then drops its replace and requires the real path. Until its row lands each consumer keeps its replace pinned to the pre-rename revision so every main stays buildable. These external repository pins, ordering and main buildability require human evaluation by the migration owner: this repository's acceptance cannot inspect or claim them. No consumer repository is modified in this delivery. (source: request)

## Source comparison
- Addressed: request Problem and Need are implemented by the canonical declaration and complete self-import migration above; no replacement dependency workaround remains part of this repository's design.
- Addressed: all three request Acceptance commands are exercised by acceptance.feature and its dedicated steps: exact `go list -m` output, no matches for the exact quoted-prefix grep, and the build/vet/test command chain.
- Addressed: the no-other-change constraint preserves runtime protocol bytes, including `api/api.go`'s `kogen-loop/v1`; Decisions resolves its lexical overlap with the requested grep without an API change.
- Addressed with explicit external human evaluation: request Order (main, 4 Nov), consumer per-repo rows, removal of replaces only on migration, and pre-rename pins before migration. Omitted from this repository's executable acceptance, deliberately: verification or edits of external consumers, which are not present inputs. This is not a claim that their pins or mains have been checked.

## Tests
- Canonical module identity: assert exact `go list -m` output (integration)
- Remove all quoted bare prefixes in Go files: require the requested recursive grep to return no matches (regression)
- Preserve existing behavior and buildability: execute `go build ./... && go vet ./... && go test ./...` with existing tests (existing)

## Feasibility
- Baseline probe ran `go list -m`, sampled the requested grep and ran `go build ./... && go vet ./... && go test ./...`: the module was `kogen-loop`, old imports existed, and the command chain passed (exit 0, 29.4 s). This local rename has no uncertain external capability dependency.
