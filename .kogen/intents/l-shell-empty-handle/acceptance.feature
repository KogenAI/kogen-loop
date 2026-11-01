Feature: Empty shell handles do not invalidate commands
  Deterministic conformance tests use the real loop.Run entry point with a scripted provider.
  The next provider request must contain the actual shell result, not a synthetic expected result.

  Scenario: A complete command and empty handle run as a new command
    # Input: {"command":"printf 'empty-handle-ok\\n'; exit 7","handle":""}
    # Expected tool output: "exit status: 7\nempty-handle-ok\n".
    When I run the shell lifecycle regression "TestShellLifecycleEmptyHandleCommand"
    Then the shell lifecycle regression "TestShellLifecycleEmptyHandleCommand" ran and passed

  Scenario: A command and nonempty handle are ambiguous
    # Input includes a marker-writing command and handle "nonempty".
    # Expected: "error: supply exactly one of command or handle" and no marker file.
    When I run the shell lifecycle regression "TestShellLifecycleAmbiguousHandle"
    Then the shell lifecycle regression "TestShellLifecycleAmbiguousHandle" ran and passed

  Scenario: Neither argument is refused
    # Input: {}. Expected: "error: supply exactly one of command or handle".
    When I run the shell lifecycle regression "TestShellLifecycleNeitherArgument"
    Then the shell lifecycle regression "TestShellLifecycleNeitherArgument" ran and passed

  Scenario: An empty handle alone is refused
    # Input: {"handle":""}. Expected: clear error feedback, not successful execution or retrieval.
    When I run the shell lifecycle regression "TestShellLifecycleEmptyHandleOnly"
    Then the shell lifecycle regression "TestShellLifecycleEmptyHandleOnly" ran and passed

  Scenario: Nonempty handle retrieval is unchanged
    # Start a command producing "partial\n", waiting 2 seconds, then producing "complete\n" and exiting 7.
    # Initial result: running with nonempty handle after the normal one-second yield.
    # Retrieve that observed handle: completed, cumulative "partial\ncomplete\n", exit_status 7.
    # Retrieval waits for completion rather than immediately returning running; no timing constants change.
    When I run the shell lifecycle regression "TestShellLifecycleHandleRetrieval"
    Then the shell lifecycle regression "TestShellLifecycleHandleRetrieval" ran and passed

  Scenario Outline: Existing shell lifecycle remains compatible
    When I run the shell lifecycle regression "<test>"
    Then the shell lifecycle regression "<test>" ran and passed

    Examples:
      | test                                     |
      | TestShellLifecycleSuccessCleanup         |
      | TestShellLifecycleImplicitSessionCleanup |
      | TestShellLifecycleFailureCleanup         |
      | TestShellLifecycleCompatibility          |
