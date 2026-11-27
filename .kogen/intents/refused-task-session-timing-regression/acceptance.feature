Feature: Pin session.ended timing for a task refused before the session starts
  This feature covers the existing refusal of `kogen-loop run` without a task argument. The command package's offline regression test must catch changes to its timing or to the refusal.

  Scenario: A refused task reports zero session timing
    When refused-task-session-timing-regression: I run the built CLI with no task argument
    Then refused-task-session-timing-regression: the CLI ends with a session.ended event whose timing is all zero with an empty tool_ms
    When refused-task-session-timing-regression: I run the package tests as written and with each of these wrong implementations:
      | nonzero session wall time |
      | absent overhead field     |
      | null tool map             |
    Then refused-task-session-timing-regression: the original package tests pass and a test fails with each wrong implementation

  Scenario: A refused task emits its error before session.ended
    When refused-task-session-timing-regression: I run the built CLI with no task argument
    Then refused-task-session-timing-regression: the CLI exits 2 after an error event and then a failed session.ended event with exit 2
    When refused-task-session-timing-regression: I run the package tests as written and with each of these wrong implementations:
      | no error event                       |
      | failed exit code for a refused task |
    Then refused-task-session-timing-regression: the original package tests pass and a test fails with each wrong implementation
