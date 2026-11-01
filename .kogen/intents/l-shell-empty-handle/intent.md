# Accept commands with an empty shell handle

Slug: l-shell-empty-handle
Model: not applicable — this fix normalizes a stateless argument-selection rule; shell job lifecycle remains unchanged
Acceptance:
- .kogen/intents/l-shell-empty-handle/acceptance.feature
- features/steps/l_shell_lifecycle.js

Fix L-SHELL-EMPTY-HANDLE (Studio issue bee3b50c-3c70-46d1-9ddf-835bbdef8d8d). Treat the exact string handle value "" as absent when selecting a new command. A complete command with that value must execute normally, not return the current key-presence exclusivity error. Do not otherwise broaden accepted argument types. Commands with nonempty handles, neither argument, and empty handle alone remain refused with clear tool feedback and no command execution. Nonempty handle retrieval and af456d5 waiting behavior remain unchanged (one-second initial yield, retrieval up to 30 seconds with immediate completion and cumulative output).

Add deterministic scripted-provider regression tests in conformance, using the existing scripted Requester and loop.Run boundary. The acceptance scenarios invoke their exact named Go tests through the existing JSON test observer; a missing, skipped or zero-run test is failure. Implement the five new test names in the feature, asserting actual tool results received by the next provider request. For rejection with a command, use a file marker to establish no execution. Keep existing lifecycle tests and handle-retrieval coverage passing. No new command, flag, option, timeout, retry or limit; no CHANGELOG entry. Change tool definition text only if necessary to explain the rule.

## Decisions
- An exact empty string handle accompanying a command means new command, not retrieval or ambiguity. (source: request)
- Truly ambiguous and empty-only calls remain refused; retrieval and waits are unchanged. (source: request)

## Source comparison
- Addressed: request Need and Acceptance evidence map to the five scripted-provider tests and existing lifecycle coverage below; the literal inputs and expected results are preserved in acceptance.feature.
- Addressed: request Problem identifies key-presence validation in tools/tools.go; replace that behavior only for an exact empty string handle with a command. Historical observations (4/142 calls across 14 measured runs on 1a3eb18, two stored trailing empty handles; 0 cases across 44 runs before handles at 8a2fcda; approximately $0.01 and one extra turn per failure) motivate the regression, not a new performance target.
- Addressed: request restrictions and README conventions are retained: no settings or timing changes, no publication, vendoring, global installation or changelog work. No requested behavior is omitted, conflicting or superseded.

## Tests
- Command plus empty handle executes and returns its result: TestShellLifecycleEmptyHandleCommand through scripted loop.Run (regression)
- Command plus nonempty handle refuses without execution: TestShellLifecycleAmbiguousHandle through scripted loop.Run (integration)
- Neither argument refuses clearly: TestShellLifecycleNeitherArgument through scripted loop.Run (integration)
- Empty handle alone refuses clearly: TestShellLifecycleEmptyHandleOnly through scripted loop.Run (integration)
- Nonempty handle retrieval retains waits and cumulative result: TestShellLifecycleHandleRetrieval using a yielding command and scripted retrieval (integration)
- Existing shell lifecycle and compatibility remain intact: unchanged TestShellLifecycleSuccessCleanup, TestShellLifecycleImplicitSessionCleanup, TestShellLifecycleFailureCleanup, TestShellLifecycleCompatibility plus configured regression checks (existing)

## Feasibility
- none
