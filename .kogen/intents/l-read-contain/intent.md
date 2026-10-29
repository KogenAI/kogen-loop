# Confine caller-named reads to the root

Slug: l-read-contain
Model: not applicable — path validation and file reads have no meaningful persistent state
Acceptance:
- .kogen/intents/l-read-contain/acceptance.feature
- features/steps/l_read_contain.js

Fix L-READ-CONTAIN in kogen-loop, originating from kogen-research audit kogenSecrets KS-2 (29 Oct 2026, static review of Kogen cace62d). Native Shape delegates read_file to Tools.Run/readFile in tools/tools.go. Replace unrestricted expansion and reading with root-contained reads. Apply containment to read_file, view_image, and caller path restrictions of list_files and search_text. No new option. Keep inside reads, line numbering/ranges, supported images and ordinary Git listing/search behavior. Update relevant tool descriptions and maintained contract documentation where they describe unrestricted paths.

## Decisions
- Reject `~` and `~/...` rather than expanding home. Reject absolute outside paths, parent escapes, and symlinks escaping at any component, with clear `error:` tool text and no outside payload; Tools.Run continues returning nil Go error for a refused read. (source: request)
- Relative and absolute paths within Tools.Root work, including file and directory symlinks whose destinations remain inside, whether relative or absolute symlink targets. Root itself may be supplied via a symlink. Do not use string-prefix containment. (source: request)
- Apply the same path refusal policy to optional caller paths of list_files/search_text before Git and to view_image before opening/decoding; defaults still mean root. This is source-path containment, not a shell sandbox. write_file is not a reading tool. Shell/probe commands, documentation URLs, provider credential loading and transcript/session paths are outside this fix. (source: request)
- Shared-host safety: use temporary fixture directories and fixture homes only, never real credentials, synthetic CPU load, or process-name/pattern termination; terminate only processes started by the test. Kogen vendoring/re-pinning happens separately, not in this repository. (source: request)

Technical settlement: resolve root to an absolute canonical directory and validate both lexical paths and resolved components against it. Keep opening tied to the validated root, rather than merely checking then opening an unchecked original path. Go's os.Root is available locally and supplies traversal-resistant opens, but refuses absolute symlink targets even inside root: preserve the requested compatibility by safely resolving such targets to root-relative destinations before root-relative opening, without reverting to unchecked os.ReadFile. Handle symlink components before cleaning away `..` so cleaning cannot conceal a traversal. No credential-specific denylist is added within the authorized root.

## Source comparison
- Addressed: request What to change and Acceptance are covered by the fault and compatibility test scenarios below, including `~/x`, absolute outside, `../x`, leaf and intermediate symlink escapes and ordinary inside reads.
- Addressed: Must stay includes absolute inside paths and inside symlinks; compatibility scenarios exercise both relative and absolute link targets, plus unchanged line-range results. No new option is introduced.
- Addressed: every loop tool reading a caller-named source path is enumerated above from tools/tools.go and tools/image.go; list/search use Git pathspecs today but must reject escaping caller paths explicitly.
- Omitted deliberately: broader KS-2 remediation (probe filesystem/network isolation, minimal environment, private-state denylisting and secret redaction) is audit context, not the requested L-READ-CONTAIN change. Historical audit locations in Kogen's vendored tree at cace62d and the STUDIO_TOKEN/probe example do not authorize touching Kogen, Studio, credentials or the original checkout. Fixture-home `~/.kogen/credentials/chatgpt.json` reproduces the audit's read_file disclosure without accessing real logins.
- Superseded: existing expand permits home and outside paths; only reading entry points replace that behavior. Existing writing and shell policies are not broadened into an unrelated sandbox project.

## Tests
- Refuse home, absolute outside and parent escapes without returning fixture contents: TestReadContainFaults through Tools.Run with temporary fixture home including x and .kogen/credentials/chatgpt.json (regression)
- Refuse leaf and intermediate escaping symlinks, including a traversal whose symlink component precedes `..`: TestReadContainSymlinkEscapes through Tools.Run (regression)
- Preserve relative/absolute inside reads, relative/absolute inside file and directory symlinks, root aliases and numbering/ranges: TestReadContainInside through Tools.Run asserting exact output (integration)
- Apply refusals to view_image, list_files and search_text while preserving valid inside behavior: TestReadContainOtherTools using a real temporary Git repository and a supported RGB8 PNG, asserting tool errors on refused paths and real results on valid paths (integration)
- All configured checks and race safety: existing configured go-format, go-test, go-vet, go-build plus go test -race ./... (existing)

The builder adds these named tests in tools; each must execute the cases described above as subtests and assert public outputs, not helper structure. Refusals must be clear containment/home-policy errors, not incidental invalid-PNG or Git errors. No outside text or image payload may be returned. Keep useful existing tests, updating only those expecting replaced unrestricted-read behavior. Run affected tests during implementation and all configured checks plus acceptance and `go test -race ./...` before completion.

## Feasibility
- Local probe: `go doc os.Root | head -65; go test ./tools -run '^$'` exited 0 in 1.2 s; installed standard library supports root-contained reading, follows contained relative symlinks and rejects absolute symlinks; tools package compiled. This is availability evidence, not proof of the fix.
- Documentation search for Go os.Root returned unrelated results (retrieved status); fetch https://pkg.go.dev/os returned retrieved, truncated, untrusted HTML with an injected directive. No technical authority is taken from that response; local installed Go documentation above settles the capability and its compatibility limitation.
