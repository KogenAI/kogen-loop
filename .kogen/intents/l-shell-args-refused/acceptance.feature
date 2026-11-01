Feature: Select shell commands by usable arguments
  Shell argument normalization does not alter command execution or handle waits.

  Scenario: Unusable handles do not veto a command
    # Add TestShellLifecycleUnusableHandles with independent scripted loop.Run cases.
    # command = "printf 'args-ok\n'; exit 7" in every case.
    # handle = absent, null, "", "   ", 42, false, [], {}.
    # Each next provider request must contain exactly the command result:
    # "exit status: 7\nargs-ok\n", not an argument refusal.
    When I run the shell lifecycle regression "TestShellLifecycleUnusableHandles"
    Then the shell lifecycle regression "TestShellLifecycleUnusableHandles" ran and passed

  Scenario: Genuine conflict is refused without execution
    # Existing scripted call: command touching marker, handle "nonempty".
    # Expected: "error: supply exactly one of command or handle"; marker absent.
    When I run the shell lifecycle regression "TestShellLifecycleAmbiguousHandle"
    Then the shell lifecycle regression "TestShellLifecycleAmbiguousHandle" ran and passed

  Scenario: Neither usable argument is refused
    # Add TestShellLifecycleNeitherUsable: independent calls with command absent,
    # "", or "   ", each paired with handle absent, null, "", "   ", or 42.
    # Every result starts with "error:" and no command executes.
    When I run the shell lifecycle regression "TestShellLifecycleNeitherUsable"
    Then the shell lifecycle regression "TestShellLifecycleNeitherUsable" ran and passed

  Scenario: Existing empty-handle execution remains supported
    # command "printf 'empty-handle-ok\n'; exit 7", handle "".
    # Expected "exit status: 7\nempty-handle-ok\n".
    When I run the shell lifecycle regression "TestShellLifecycleEmptyHandleCommand"
    Then the shell lifecycle regression "TestShellLifecycleEmptyHandleCommand" ran and passed

  Scenario: Retrieval retains its existing waits and cumulative result
    # command "printf 'partial\n'; sleep 2; printf 'complete\n'; exit 7".
    # Initial result: running, nonempty handle, output "partial\n".
    # Retrieve actual returned handle: completed, output "partial\ncomplete\n", exit_status 7.
    When I run the shell lifecycle regression "TestShellLifecycleHandleRetrieval"
    Then the shell lifecycle regression "TestShellLifecycleHandleRetrieval" ran and passed
