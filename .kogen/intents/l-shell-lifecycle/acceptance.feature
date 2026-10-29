Feature: Shell lifecycle custody
  Scenario Outline: Lifecycle regression is exercised
    When I run the shell lifecycle regression "<test>"
    Then the shell lifecycle regression "<test>" ran and passed
    Examples:
      | test                                    |
      | TestShellLifecycleCancelStartup          |
      | TestShellLifecycleDeadlineStartup        |
      | TestShellLifecycleKilledHostDescendants  |
      | TestShellLifecycleSuccessCleanup         |
      | TestShellLifecycleFailureCleanup         |
      | TestShellLifecycleCompatibility          |

  Scenario: Race detector and existing behavior stay green
    When I run the shell lifecycle race suite
    Then the shell lifecycle race suite passes
