# Preserve failed writes and report refusals

Slug: l-loop-correct
Model: .kogen/intents/l-loop-correct/model.qnt invariants=Preserved seed=1 samples=100 steps=20
Acceptance:
- .kogen/intents/l-loop-correct/acceptance.feature
- features/steps/l_loop_correct.js

Fix LC-02, LC-03 and LC-04 from the 29 October 2026 static loopCorrect audit of b97ee73. LC-01 belongs to L-SHELL-LIFECYCLE and is not changed here. Replace destructive write_file replacement, lost final refusal text and nil-session panics. No new option, dependency, provider request, retry or unrelated refactoring. Normal tool, session and provider behavior remains byte-identical except the requested corrections. All configured checks and go test -race ./... must pass.

## Decisions
- Failed write_file must leave the previous bytes intact, including valuable uncommitted src/config.go contents when a 64 KiB replacement fails partway. (source: request)
- Publish Responses refusal text in round.ended.claim, alongside output_text in original content order, separated by the existing newline join. A refusal-only answer produces exactly I cannot perform that request. It remains an ended model claim, never verified completion. No transcript directory is required. (source: request)
- Direct.Request and Client.Respond reject an omitted Session with a clear error, without panic, credentials or network activity. Use a typed validation error with code missing_session and message Session is required. (source: request)
- Shared-host testing uses temporary directories only, no synthetic CPU load and no name/pattern process termination; only processes started by a test may be signalled. (source: request)

Technical settlement: write a same-directory temporary replacement, check write and close, then atomically rename only on success; remove temporary artifacts on failure. Preserve existing regular-file permission bits, creation mode 0666 subject to umask, existing permission refusals and protected-path checks. Follow existing symlinks to their target (retain the link itself), and reject nonregular targets without mutation. Do not silently replace a read-only file just because its directory is writable. Hardlink aliases need not receive the new replacement bytes: atomic replacement is a deliberate change in inode identity, not a filesystem sandbox. Document this narrow consequence. No promise of multi-file transactions or directory-fsync crash durability is added.

Add builder-owned regression tests named below in ./conformance, reusing its fake Responses server and real CLI harness. Acceptance executes those tests and rejects absent or skipped tests. The tests themselves must exercise the named public entry points and assertions, not merely return success.

## Source comparison
- Addressed: request LC-02 and audit tools/tools.go destructive os.WriteFile trace; contract above and FailedWrite regression require a real partial-write fault, preserved preimage and unchanged successful behavior.
- Addressed: request LC-03 and audit refusal-only and mixed-content process examples; Refusal and Mixed regression scenarios require real accepted/replayed Responses streams through the built CLI without session.dir and exact claim text. Existing response/replay bytes stay intact.
- Addressed: request LC-04 and audit Direct.Request/Client.Respond nil paths including profiled requests; MissingSession regression requires both public entry points to fail clearly before any transport, rather than merely patching CheckSeams and leaving Classify exposed.
- Addressed: request normal byte fidelity, no option, all checks including -race and shared-host safety; compatibility scenario plus configured checks and testing constraints above.
- Omitted deliberately: LC-01 as explicitly assigned to L-SHELL-LIFECYCLE; the audit's checked-and-sound areas and historical source-root path are evidence, not additional work. No release, pin, global installation or live provider work.
- Superseded narrowly: direct truncation/inode mutation for write_file is replaced by atomic replacement; symlink links remain links, hardlink aliases retain their preimage. This is necessary atomic-replacement semantics, not a new sandbox.

## Tests
- LC-02 partial-write failure preserves old bytes: TestLoopCorrectFailedWrite invokes write_file on src/config.go with a 65536-byte replacement in a temp root, causing EFBIG after a partial write in an isolated child using RLIMIT_FSIZE and ignored SIGXFSZ; assert error result, byte-exact preimage and no leaked temp replacement (regression)
- Successful writes retain existing behavior: TestLoopCorrectCompatibility covers creation, replacement, permissions, protected-path refusals, symlink target behavior and nonregular refusal using real temporary files, and retains existing byte golden tests unchanged (integration)
- LC-03 refusal-only output survives acceptance/replay and CLI exit: TestLoopCorrectRefusal serves a complete valid Responses refusal with no calls to the actual CLI without session.dir; assert exactly one round.ended with the feature's exact claim and normal ended exit, plus retained refusal in replay where replay occurs (regression)
- LC-03 mixed text/refusal preserves ordered text: TestLoopCorrectMixed uses output_text Before, refusal I cannot perform that request., output_text After; assert exact newline-joined claim, unchanged response items and no verified-completion assertion (regression)
- LC-04 missing session is an error: TestLoopCorrectMissingSession calls both Direct.Request with Client provider.NewClient("host") and Client.Respond with nil session for known unprofiled and profiled roles and small valid requests; assert typed missing_session error, exact message, nil response, no panic and zero transport calls (regression)
- Normal behavior and concurrency remain compatible: go test -race ./... and all configured format/test/vet/build checks pass with existing tests retained (existing)

## Feasibility
- Quint model typecheck and seeded TypeScript run succeeded in scratch; model represents replacement success/failure and preimage preservation, not filesystem durability. (probe 2: exit 0, 1.0 s)
- Initial smaller model typecheck succeeded; replaced by the stronger preimage invariant. (probe 1: exit 0, 0.6 s)
- evidence: {"id":"named-test-observer","kind":"observer","inputs":["features/steps/l_loop_correct.js"],"observers":["features/steps/l_loop_correct.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/l_loop_correct.js --control good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/l_loop_correct.js --control bad","exit":1,"output":"rejected\n"}]}
