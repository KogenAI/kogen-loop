Feature: Refuse task deadlines that overflow a duration
  This feature exercises whole seconds in task validation and at the CLI boundary.

  Scenario: Refuse the first unrepresentable deadline in validation
    When deadline-duration-overflow-refusal: validate a task with deadline_seconds "first above maximum"
    Then deadline-duration-overflow-refusal: validation refuses the task, naming "deadline_seconds" and the supplied value

  Scenario: Accept the largest representable whole-second deadline
    When deadline-duration-overflow-refusal: validate a task with deadline_seconds "maximum"
    Then deadline-duration-overflow-refusal: validation accepts the task without running a round

  Scenario: Accept zero as no task deadline
    When deadline-duration-overflow-refusal: validate a task with deadline_seconds "zero"
    Then deadline-duration-overflow-refusal: validation accepts the task without running a round

  Scenario: Still refuse negative seconds
    When deadline-duration-overflow-refusal: validate a task with deadline_seconds "negative one"
    Then deadline-duration-overflow-refusal: validation refuses the negative deadline

  Scenario: Report deadline overflow as an invalid task at the CLI
    When deadline-duration-overflow-refusal: pipe a task with deadline_seconds "first above maximum" to kogen-loop run --task -
    Then deadline-duration-overflow-refusal: the CLI refuses the task with exit 2, naming "deadline_seconds" and the supplied value before starting a session
