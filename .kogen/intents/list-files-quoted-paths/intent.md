# Print real paths in list_files and search_text

Slug: list-files-quoted-paths
Model: not applicable — stateless rendering of Git's path output; no state or interacting rules
Acceptance:
- .kogen/intents/list-files-quoted-paths/acceptance.feature
- features/steps/list_files_quoted_paths.js
- features/steps/list_files_quoted_paths_driver.go

`list_files` (tools/tools.go `listFiles`) and `search_text` (tools/tools.go `searchText`) currently return Git's default output. Git octal-quotes any path holding a non-ASCII byte, a control character, `"` or `\` (for example `"caf\303\251.txt"`, and `"caf\303\251.txt":1:needle` from `search_text`). A model that copies that string into `read_file` or `write_file` names a file that does not exist. After this change both tools print every path exactly as the file system spells it, so the printed path can be passed unchanged to `read_file` and the other file tools. The only exception is a name that cannot be shown verbatim, which is printed in one documented, unambiguous quoted form.

Path rule (both tools, applied to each path Git reports):
- A path is printed verbatim when it is valid UTF-8, every rune satisfies Go's `strconv.IsPrint` (letters, marks, numbers, punctuation, symbols and the ASCII space), and it does not start with `"`. Non-ASCII UTF-8 (`café.txt`), spaces (`a b.txt`), a backslash or `"` that is not the first byte (`back\slash.txt`), and trailing spaces are all printed verbatim, without quotes or escapes.
- Any other path is printed as `strconv.Quote(path)`, a Go double-quoted string literal. Examples:
  - a newline gives `"line\nbreak.txt"`;
  - a tab gives `"é/tab\there.txt"` (printable non-ASCII stays UTF-8 inside the literal);
  - byte 0x01 gives `"q/start\x01.txt"`;
  - invalid UTF-8 byte 0xE9 gives `"caf\xe9.txt"`;
  - a leading quote gives `"\"quoted.txt"`.
  - U+00AD (soft hyphen, a format character that `strconv.IsPrint` rejects) in `q/soft<U+00AD>hyphen.txt` is written as ASCII. The result is `"q/soft`, then one backslash, then the five ASCII characters `u00ad`, then `hyphen.txt"`. This is Go's 4-hex-digit Unicode escape, exactly what `strconv.Quote` returns.
- So the form is unambiguous: a printed path that starts with `"` is always the quoted form, decoding it with `strconv.Unquote` (or JSON for these escapes) gives the exact name, and any other printed path is the exact name. A quoted path never contains a raw newline, so each printed path occupies exactly one line. The file tools are not changed to accept the quoted form. They accept the decoded name: `read_file` with the decoded `line\nbreak.txt` reads that file.

Implementation route (no other output changes):
- `list_files` runs `git ls-files -z --cached --others --exclude-standard --deduplicate -- [pathspec]`, which is today's argv plus `-z`, still exactly one `Tools.Repo.Run` call. Git then prints raw, unquoted names, each terminated by NUL. Empty stdout stays `(no files)`. Otherwise the result is the rendered names, in Git's order, joined with `\n`. Do not trim trailing white space, because that would alter a last name that ends in a space; there is no trailing newline.
- `search_text` runs `git grep -z -n -I -E --untracked -e <pattern> -- [pathspec]`, which is today's argv plus `-z`, still one Run. With `-z -n`, each match record is `<path>NUL<line number>NUL<text>LF`, as observed with git 2.54. Parse records in order: the path up to the first NUL, the number up to the next NUL, and the text up to the next LF (the text may contain NUL). Each output line is `<rendered path>:<number>:<text>`. Lines are joined with `\n`, and the whole result keeps today's `trimTrailing`, which affects only the last match's text, as now. Exit status 1 stays `(no matches)`, and other statuses or a Git that cannot run keep today's `git_failed` errors.
- Unchanged: inclusion rules (tracked and untracked files listed and searched, ignored files not), ordering (Git's), dedup, root containment and pathspec handling, error texts and classes, and the 16384-byte cut applied at delivery. `Tools.Snapshot` keeps its own `ls-files -z` names, its line-count consistency check and its `read_file <Go-quoted real path>` headers. Its listing section now shows the new `list_files` text (for example `café notes.md` instead of `"caf\303\251 notes.md"`).
- Documentation: append this exact sentence, after one space, to the model-facing descriptions of both `list_files` and `search_text` in tools/defs.go, and regenerate tools/testdata/defs_golden.json: `Each path is printed as named, except that a name holding a control or other non-printable character or invalid UTF-8, or starting with ", is printed as a Go double-quoted string literal (for example "a\nb.txt"): decode it to get the path.` Here `\n` is a literal backslash followed by `n`. In docs/contract/loop-v1.md, document the same rule, the `-z` routes and the unchanged parts. Following the README, add no CHANGELOG.md entry.

Existing tests that pin the old quoted output change with the behavior. In tools/testdata/tools_golden.json, the `list_files` and `search_text` results that hold `"dir/\303\251.txt"` or `"img/unicode-\303\251.png"` now expect `dir/é.txt` and `img/unicode-é.png`. tools/snapshot_test.go `TestSnapshotIsTheDeliveredToolOutputs` asserts `café notes.md` verbatim. The fake `olRepo` in loop/tool_overlap_helpers_test.go answers `ls-files` and `grep` in the `-z` form, so the overlap tests keep their current expectations. Kogen's caller-supplied `Tools.Repo` receives the extra `-z` argument through the same `Git.Run` interface, as `Snapshot` already does. No interface, setting or option is added.

## Decisions
- Both tools print each path exactly as the file system spells it, so it can be passed unchanged to `read_file` and the other file tools. Non-ASCII UTF-8 names print as UTF-8, and names with spaces stay bare. (source: request)
- The request allows either an escape form that the file tools accept back or a clear mark. A name that cannot be shown verbatim (newline, other control byte, invalid UTF-8, another non-printable rune) is printed as a Go double-quoted literal. A leading `"` is the clear mark, and the literal decodes to the exact name. A name that really starts with `"` is quoted too, which keeps the form unambiguous. The file tools are not changed and take the decoded name. (source: request)
- The quoted form is documented in both tool descriptions with the exact sentence above, and in the caller contract. (source: request)
- Ordering, dedup, `(no files)`, `(no matches)`, the 16 KiB cut and the inclusion rules for tracked, untracked and ignored files are unchanged. (source: request)

## Source comparison
- Addressed, request Problem and Need: Git's octal quoting is removed by reading `-z` output and rendering it by the path rule. Scenarios "list_files prints a non-ASCII name…" and "search_text prints the real path…" fail on today's output `a b.txt\n"caf\303\251.txt"`.
- Addressed, synthetic acceptance 1 (`café.txt` and `a b.txt` containing `needle`; `list_files` returns exactly `a b.txt` and `café.txt`, without quotes or backslashes): scenario 1 checks exact equality with `a b.txt\ncafé.txt`.
- Addressed, synthetic acceptance 2 (`search_text` pattern `needle` gives `a b.txt:1:needle` and `café.txt:1:needle`): scenario 2.
- Addressed, synthetic acceptance 3 (printed `café.txt` fed to `read_file` returns `needle`): scenario 3 takes line 2 of the actual `list_files` result and expects `read_file` output `1\tneedle`.
- Addressed, synthetic acceptance 4 (a newline name made by the shell tool is listed in the documented form without corrupting line structure): scenario 4 creates `line\nbreak.txt` through the `shell` tool and expects three exact `list_files` lines and three exact `search_text` lines. `read_file` of the decoded third line returns `needle`. The documentation scenario checks both descriptions.
- Addressed, synthetic acceptance 5 (untracked, ignored and tracked files keep their inclusion rules): the inclusion scenario uses a committed `tracked-é.txt`, an untracked `untracked-é.txt` and an ignored `ignored-é.log` (`.gitignore` `*.log`), and also checks `(no files)` and `(no matches)`.
- Addressed, "never silently altered": the tab, control-byte, non-printable-Unicode (U+00AD) and leading-quote scenarios, and the backslash-name scenario. Today Git prints `"back\\slash.txt"`; it must now print `back\slash.txt`, and `read_file` must accept that. In the U+00AD scenario, the expected doc string writes `<BS>` for one backslash, so the escape is spelled in plain ASCII. Invalid UTF-8 cannot be created on the macOS acceptance filesystem (APFS refuses such names), so a unit test covers it through a `Tools.Repo` fake. Today's trailing-white-space trim of `list_files` would alter a last name ending in a space, so it is removed for `list_files` and covered by a test.
- Unchanged and not re-specified: ordering, dedup, the 16 KiB cut, root containment and error classes. Existing tests keep covering them.

## Tests
- `list_files` prints non-ASCII UTF-8 names, spaces and inner backslashes verbatim from `ls-files -z`: add a tools test on a real repository with `café.txt`, `a b.txt` and `back\slash.txt` asserting the exact result (integration)
- `search_text` prints `<path>:<line>:<text>` with the real path from `grep -z -n`: extend the same test with exact `search_text` output, including a match text that keeps its content (integration)
- Names with a newline, a tab, a control byte, a non-printable rune or a leading `"` print as `strconv.Quote` of the name, one line each: add a tools test on a real repository asserting the exact quoted lines from both tools (integration)
- An invalid UTF-8 name prints as `"caf\xe9.txt"` from both tools: add a unit test with a `Tools.Repo` fake answering `caf\xe9.txt\x00` for `ls-files` and `caf\xe9.txt\x001\x00needle\n` for `grep` (unit)
- A last listed name ending in a space keeps the space: add it to the real-repository tools test (integration)
- A printed path round-trips into `read_file`, and the decoded quoted form of a newline name reads that file: acceptance scenarios 3 and 4 through the real tools (scenario)
- The quoted form is documented in both definitions: regenerate tools/testdata/defs_golden.json so `TestGenericDefinitionsMatchTheGolden` pins the new descriptions, plus the acceptance description scenario (unit)
- The old quoted results of `dir/é.txt` and `img/unicode-é.png` change: update the expected results in tools/testdata/tools_golden.json used by `TestToolsMatchTheElixirResults` (regression)
- The snapshot listing shows the real name: update `TestSnapshotIsTheDeliveredToolOutputs` to expect `café notes.md` (regression)
- Inclusion rules, ordering, dedup, `(no files)` and `(no matches)`: existing `TestListAndSearchUseTheRepoGiven` and contract `TestToolsListAndSearchThroughGit` stay green, and the acceptance inclusion scenario checks them with non-ASCII names (existing)
- One Git run per call through `Tools.Repo`: existing contract `TestToolsRepoRunsTheGitOfTheCaller` (existing)
- The 16384-byte cut at delivery: existing Cut tests (existing)
- Overlap ordering through a fake Git: existing loop `TestToolOverlap*` tests, with the `olRepo` fake answering in `-z` form (existing)

## Feasibility
- Scratch observations outside the checkout, not Kogen probes and not retained evidence: with git 2.54.0 (Apple Git-157) on darwin, `ls-files -z --cached --others --exclude-standard --deduplicate` printed raw names such as `café.txt` and `nl<LF>x.txt` terminated by NUL, while the default output printed `"caf\303\251.txt"` and `"nl\nx.txt"`. `grep -z -n -I -E --untracked -e needle --` printed records `<path>NUL<n>NUL<text>LF` in the same order as the default output. In the default output, untracked entries came before tracked entries, so the inclusion scenario compares sorted lines.
- With go1.27.2, `strconv.IsPrint(0xAD)` printed `false`, and `strconv.Quote` of the soft-hyphen name printed the ASCII escape: a backslash followed by `u00ad`.
- On the unchanged tree, the submitted acceptance failed all 10 scenarios, each at its first assertion and with the old quoted output (for example `"q/soft\302\255hyphen.txt"`). On a scratch copy with the `-z` route and the path rule above, all 10 scenarios and 101 steps passed. On that copy, the tests that pin the old output (defs golden, Elixir tools golden, snapshot listing, overlap fake) failed as listed above.
- No external protocol or provider facts are involved; the Git `-z` output shape is the one dependency, and it was observed locally. No declared evidence obligation: the steps compare exact tool text against literals in the feature through a single-call collector.
- none
