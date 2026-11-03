# Accept commands with unusable shell handles

Slug: l-shell-args-refused
Model: not applicable — argument selection is stateless; existing shell lifecycle and wait semantics are unchanged
Acceptance:
- .kogen/intents/l-shell-args-refused/acceptance.feature
- features/steps/l_shell_lifecycle.js

Fix L-SHELL-ARGS-REFUSED in kogen-loop, Studio issue bee3b50c-3c70-46d1-9ddf-835bbdef8d8d, extending L-SHELL-EMPTY-HANDLE (a0a4c0e). A usable command (a non-whitespace string) starts a new command when handle is absent, null, empty, whitespace-only, or any non-string value. A usable handle is a string containing non-whitespace characters. A usable command plus usable handle, or neither usable argument, is refused clearly without executing a command. Preserve actual nonempty handle identity when retrieving; do not trim identifiers into different handles. Retain existing invalid-command type feedback where applicable. No new command, flag, option, timeout, retry or limit. Preserve one-second initial yield, retrieval up to 30 seconds, immediate completion and cumulative output, and round cleanup. Change tool definition text only if necessary to describe this selection behavior. Do not change CHANGELOG.md, publish, install, or update Kogen's vendored copy or pin.

Implement focused argument-selection tests in tools and deterministic scripted-provider regressions in conformance, reusing runShellArgs, scripted and the existing lifecycle setup. New TestShellLifecycleUnusableHandles must exercise each input from the feature independently through loop.Run and assert the exact shell result returned to the next provider request. TestShellLifecycleNeitherUsable must exercise the specified no-usable-argument cases. Keep existing lifecycle scenarios. Update obsolete null/number rejection expectations in tools/shell_empty_handle_test.go rather than preserving contradictory assertions. Production changes are expected in tools/tools.go; no protected implementation edit is required.

## Decisions
- Run commands when the supplied handle cannot name a usable handle; reject genuine conflicts and neither-argument calls clearly (source: request)
- Preserve retrieval and waits; do not add settings or change limits (source: request)

## Source comparison
- Addressed: request Need and Acceptance evidence are covered by the argument categories above and acceptance scenarios for TestShellLifecycleUnusableHandles, TestShellLifecycleAmbiguousHandle, TestShellLifecycleNeitherUsable and TestShellLifecycleHandleRetrieval.
- Superseded: the old exact-empty-only scope in .kogen/intents/l-shell-empty-handle/intent.md and null/number rejection expectations in tools/shell_empty_handle_test.go are replaced by the broader unusable-handle rule. The old protected Intent itself is not edited.
- Addressed: request historical scan of 92 build cells on 1 Nov at loop pin 1a3eb18, 48/357 calls (13.4%), 43/76 cells (Studio 10/16, laptop 19/34, the Linux test host 14/26), earlier 4/142, refusals mostly 4–6 calls from cell end after 2,000–5,000-byte commands, including 2,374 bytes refused at 04:04:45Z and reissued 04:05:51Z, motivates this regression, not a latency target. Hash-only argument logging and the 46-byte refusal do not establish historical argument shapes; deterministic cases cover the requested categories without inventing recovered calls.
- Addressed: request forbids new options and timing/limit changes; boundaries above and retained existing lifecycle tests enforce unchanged behavior. No requested behavior is intentionally omitted.

## Tests
- Usable command with absent/null/empty/whitespace/non-string handle executes and returns result: TestShellLifecycleUnusableHandles via scripted loop.Run plus focused tools selection cases (regression)
- Usable command plus nonempty string handle refuses and does not execute: existing TestShellLifecycleAmbiguousHandle (existing)
- Neither usable argument refuses without execution: TestShellLifecycleNeitherUsable and existing TestShellLifecycleNeitherArgument/TestShellLifecycleEmptyHandleOnly (integration)
- Nonempty handle retrieval retains cumulative output and completion: existing TestShellLifecycleHandleRetrieval (existing)
- Existing shell lifecycle and process behavior remain passing: configured go-test check and retained empty-handle lifecycle scenarios (existing)

## Feasibility
- evidence: {"id":"named-test-observer","kind":"observer","inputs":["features/steps/l_shell_lifecycle.js"],"observers":["features/steps/l_shell_lifecycle.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/l_shell_lifecycle.js --control good","exit":0,"output":"observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/l_shell_lifecycle.js --control bad","exit":1,"output":"observer rejected\n"}]}
