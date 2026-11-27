Feature: Pin the refusal of a task requiring an unsupported capability
  This feature covers the existing refusal by `kogen-loop run` of a task that requires subagents. The command package's offline regression test must catch changes to that refusal or to its event sequence.

  Scenario: A task requiring subagents is refused as an unsupported capability
    When unsupported-required-capability-regression: I run the built CLI with a task requiring subagents
    Then unsupported-required-capability-regression: the CLI exits 2 with an unsupported_capability error naming subagents and no session.started event
    When unsupported-required-capability-regression: I run the package tests as written and with each of these wrong implementations:
      | accepts the unsupported requirement |
      | starts a session before refusing    |
      | refuses with the failed exit code   |
      | omits the capability name           |
    Then unsupported-required-capability-regression: the original package tests pass and a test fails with each wrong implementation

  Scenario: The refusal precedes the final session.ended event
    When unsupported-required-capability-regression: I run the built CLI with a task requiring subagents
    Then unsupported-required-capability-regression: the CLI emits the error event and then session.ended as the final event
    When unsupported-required-capability-regression: I run the package tests as written and with each of these wrong implementations:
      | omits session.ended                  |
      | emits the refusal after session.ended |
    Then unsupported-required-capability-regression: the original package tests pass and a test fails with each wrong implementation
