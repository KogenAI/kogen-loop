Feature: Stable working tree after yielded shell cleanup
  A round owns its real shell processes until they finish or are stopped.
  Returning a running envelope is not permission to outlive round cleanup.

  Scenario: A yielded temporary-file writer is stopped before return
    When I run the shell lifecycle regression "TestShellLifecycleYieldSnapshot"
    Then the shell lifecycle regression "TestShellLifecycleYieldSnapshot" ran and passed

  Scenario Outline: Existing lifecycle guarantees remain intact
    When I run the shell lifecycle regression "<test>"
    Then the shell lifecycle regression "<test>" ran and passed
    Examples:
      | test                                      |
      | TestShellLifecycleSuccessCleanup          |
      | TestShellLifecycleImplicitSessionCleanup  |
      | TestShellLifecycleFailureCleanup          |
      | TestShellLifecycleCompatibility           |
      | TestShellLifecycleHandleRetrieval         |
      | TestShellLifecycleCancelStartup           |
      | TestShellLifecycleDeadlineStartup         |
