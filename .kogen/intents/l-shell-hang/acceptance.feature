Feature: Yield long shell commands without terminating them
  Scenario: A running command yields and can be joined with bounded waits
    When I run the bounded shell CLI fixture "yield"
    Then the bounded shell observations are:
      """
      {"yieldedAlive":true,"pollBounded":true,"completed":true,"cleaned":true,"requests":4}
      """

  Scenario: Round completion cleans up a yielded command
    When I run the bounded shell CLI fixture "finish"
    Then the bounded shell observations are:
      """
      {"yieldedAlive":true,"cleaned":true,"requests":2}
      """

  Scenario: Cancellation cleans up a yielded command
    When I run the bounded shell CLI fixture "cancel"
    Then the bounded shell observations are:
      """
      {"yieldedAlive":true,"cleaned":true,"requests":2}
      """

  Scenario: Short commands retain exit status and combined output
    When I run the bounded shell CLI fixture "quick"
    Then the bounded shell observations are:
      """
      {"quick":true,"requests":2}
      """
