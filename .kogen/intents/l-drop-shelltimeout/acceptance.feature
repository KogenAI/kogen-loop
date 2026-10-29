Feature: Remove the per-call shell time limit
  Scenario: The public Tools API has no shell timeout
    When I inspect the shell-limit Tools API
    Then the shell-limit API does not contain "ShellTimeout"

  Scenario: Default shell and custody behavior remains valid
    When I run the shell-limit behavior packages
    Then the shell-limit behavior packages pass
