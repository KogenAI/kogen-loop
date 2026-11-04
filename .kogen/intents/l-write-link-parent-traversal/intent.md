# Resolve write_file links before parent steps

Slug: l-write-link-parent-traversal
Model: not applicable — one write_file call resolves one path argument against a fixed filesystem and writes, refuses or fails once; concrete filesystem fixtures specify every outcome
Acceptance:
- .kogen/intents/l-write-link-parent-traversal/acceptance.feature
- features/steps/l-write-link-parent-traversal__write.js

`write_file` (`tools.Tools`, `writeFile` in `tools/tools.go`) currently turns its path argument into a lexically cleaned absolute path (`expand`/`resolve`: `~` expansion, join to `Root`, `filepath.Clean`) before it touches the filesystem. So `link/../note.txt`, where `link` is a symbolic link to a directory elsewhere, is cleaned to `<root>/note.txt`. The operating system, a shell command and the reading tools (`contain` in `tools/contain.go`) follow `link` first and step up from its target. The write says `ok` and lands in a different file than a later `read_file` or shell command on the same text. Observed on the unchanged tree with the fixture of the first scenario: `write_file` returns `ok` and creates `<root>/note.txt`, `<root>/dest/note.txt` stays absent, and `read_file path=link/../note.txt` returns `error: link/../note.txt does not exist`.

After this change, `write_file` resolves a path argument as the filesystem does. The destination it writes, the destination a protected refusal names and the destination the protection checks compare are the same resolved file.

Resolution of the path argument P:
- `~` and `~/...` expand to the home folder, and a relative P joins `Root`, as today. A P containing a NUL byte keeps today's results and order: refused when that text is in `Protected`, otherwise `error: <P>: badarg`.
- Components are taken from left to right. Empty and `.` components are skipped. A link is followed where it appears: a relative target is taken from the link's folder, an absolute target starts again at `/`. A `..` steps up one level from the location resolved so far, so a `..` after a link steps up from the link's target, not from the folder that holds the link. A component that does not exist is taken as written. A `..` right after it removes it, as today, and missing folders are still created before the write.
- When the component right before a `..` is a link (or a chain of links), that link must resolve to an existing directory. Otherwise the call returns the existing file-error form `error: <P>: <reason>` with error kind `file_error`, creates no folder, writes nothing and returns promptly. The reason is `enoent` when the target or a component of it does not exist (`gone -> missing/dir` gives `error: gone/../note.txt: enoent`). It is `eloop` for a link loop or more than 40 links (`loop -> loop` gives `error: loop/../note.txt: eloop`). For a target that is not a directory, the reason is the one the OS gives (`enotdir`).
- The final component keeps today's behavior: an existing final link is followed and remains a link, and a missing file is created. Nonregular, read-only and other failures keep today's texts.
- A path with no link right before any `..` resolves to the same file as today's cleaned path. This holds for missing folders, existing folders and files before `..`, absolute paths, `~`, and links in `Root`'s own path such as macOS `/var` -> `/private/var`. Such paths keep today's results: `ok`, created folders, protected refusal and its message, and error texts.

Protection: a call is refused with the existing text `refused: <rel> is part of the approved acceptance baseline` (kind `protected`) before any folder is created or byte changed, in two cases. The first case is when the root-relative form of P, with links before a `..` resolved as above and the remaining components as written, is in `Protected`; for P without a link before `..`, that form is today's cleaned form. The second case is when its fully resolved destination is in `Protected`, which is today's resolved-destination check computed from this resolution. A call whose resolved destination is not protected is not refused merely because the lexically cleaned text is protected: with `note.txt` protected, `link/../note.txt` writes `dest/note.txt` and leaves `note.txt` unchanged. With `dest/note.txt` protected, the same call is refused naming `dest/note.txt`. No new refusal class is added and writes gain no containment: a link target outside the root is written there.

The overlap footprint of a `write_file` call (`tools/footprint.go`) names this same resolved destination, so the scheduler does not treat `link/../note.txt` as a write to `<root>/note.txt`. A path that cannot be resolved remains a barrier.

In the "Atomic `write_file`" section of `docs/contract/loop-v1.md`, add one sentence: a link before a `..` is followed first, and an unresolvable link there is a file error. The model-facing tool definitions, the reading tools, `shell`, CLI, events and `api` constants do not change. Add no option or setting and no CHANGELOG entry.

## Decisions
- `write_file` follows each link where it appears, and a `..` after a link steps up from the link's target, as the filesystem, a shell and `read_file` do (source: request)
- What the call writes, the destination a refusal names and what protection compares are one resolved file; a protected lexical form alone does not refuse a write that resolves elsewhere (source: request)
- Paths without a link before a `..` behave exactly as today: relative to the root, `~` expansion, missing folders created, `ok` result, protected refusal and its message (source: request)
- No new refusal class for ordinary paths and no containment for writes (source: request)
- A link loop or a link to a missing folder before `..` returns `error: <path>: <reason>` (`eloop`, `enoent`), creates nothing and does not hang (source: request)
- `~/x` and a path with a NUL byte keep their current results (source: request)

## Source comparison
- Request Problem: reproduced on the unchanged tree. The first scenario's fixture writes `<root>/note.txt`, and `read_file` of the same text reports that it does not exist. The scenario requires `dest/note.txt` written, `note.txt` absent and `read_file` returning `1\twritten`.
- Request Need (resolution, same destination for write, report and protection): addressed by the resolution and protection rules above and the acceptance scenarios 1, 2, 6 and 7; the overlap footprint follows the same destination so the documented scheduling promise ("resolved through `..` and symlinks") stays true.
- Request Need (paths without a link before `..` unchanged; no new refusal class; no write containment): scenarios 3, 4, 5 and 8 (cleaned location, created folders, kept refusal and message) and scenario 2 (outside target written, `ok`).
- Synthetic acceptance 1: scenario "A link followed by .. writes beside the link's target and reads back" uses `root/dest/child/`, `root/link -> dest/child` and the call `link/../note.txt`.
- Synthetic acceptance 2: the scenario "An absolute link target outside the workspace writes beside that target" uses an absolute link to `$OUT/child`. `$OUT/note.txt` is written, `note.txt` is absent and the result is `ok`.
- Synthetic acceptance 3: scenarios for `a/../b.txt` (missing `a`) and `./sub/../b.txt` (existing `sub`), plus `a/../new/b.txt`, which shows that missing folders are still created.
- Synthetic acceptance 4: the refusal scenario uses protected `dest/note.txt` with content `keep` and the message `refused: dest/note.txt is part of the approved acceptance baseline`. The counter-example uses protected `note.txt`, so the lexical form alone is not refused. The scenario for protected `b.txt` via `a/../b.txt` keeps today's refusal.
- Synthetic acceptance 5: the loop scenario expects `error: loop/../note.txt: eloop`, and the missing-target scenario `gone -> missing/dir` expects `error: gone/../note.txt: enoent`. Both expect error kind `file_error`, no `note.txt` and no `missing` folder. Each driver run must finish within 20 seconds.
- Synthetic acceptance 6: `~/x` writes `$HOME/x` (`ok`), and `a\u0000b.txt` returns `error: a\u0000b.txt: badarg` (`file_error`), as observed on the unchanged tree.
- No requested behavior or literal is omitted, conflicting or superseded. A link to a non-directory before `..` (`enotdir`) is stated only so that the rule is complete; it is not tested as a separate category.

## Tests
- A link before `..` is followed first, for relative and absolute targets, and the written file is the one `read_file` reads: a focused Go regression test in `tools` with temporary-directory fixtures, plus acceptance scenarios 1 and 2 (regression)
- Paths without a link before `..` keep the cleaned location and created folders: Go integration cases for `a/../b.txt`, `./sub/../b.txt` and `a/../new/b.txt`, plus acceptance (integration)
- Protection compares the resolved destination, so a protected `dest/note.txt` is refused unchanged, a lexical-only protected `note.txt` is not refused and stays unchanged, and `a/../b.txt` with `b.txt` protected keeps its refusal: Go cases beside `TestProtectedWriteDestinations`, plus acceptance (regression)
- A link loop or a link to a missing folder before `..` returns `eloop` or `enoent` as a `file_error` and creates nothing: Go regression cases and acceptance (regression)
- `~/x` and NUL paths keep their results: existing tests plus acceptance scenarios (existing)
- The write footprint names the resolved destination of `link/../note.txt`, and an unresolvable path stays a barrier: a focused Go test of the `tools` footprint (integration)

## Feasibility
- On the unchanged tree, the step's Go driver built from a temporary file inside this module and ran every fixture. `link/../note.txt` wrote `note.txt` and not `dest/note.txt`, and its read returned `error: link/../note.txt does not exist`. The absolute-target, protected, loop and missing-target cases all wrote `note.txt` with `ok` or refused `note.txt`. `a/../b.txt`, `./sub/../b.txt`, `~/x` and the NUL path matched the expectations kept here. A shell write to `loop/../n.txt` failed with "too many levels of symbolic links" (ELOOP), and one to `gone/../n.txt` failed with "no such file or directory" (ENOENT).
- evidence: {"id":"write-observer","kind":"observer","inputs":["features/steps/l-write-link-parent-traversal__write.js"],"observers":["features/steps/l-write-link-parent-traversal__write.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/l-write-link-parent-traversal__write.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/l-write-link-parent-traversal__write.js bad","exit":1,"output":"rejected\n"}]}
