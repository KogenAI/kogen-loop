Feature: New shell commands wait up to 45 seconds before yielding
  A new shell command that finishes within 45 seconds returns its exit status and
  output in the same tool response; a longer one still yields a handle without being
  killed. Cancellation and the round deadline end the wait and stop the command.

  Scenario: A command that finishes in a few seconds needs no fetch request
    When I run the bounded shell wait CLI fixture "fast"
    Then the bounded shell wait observations are:
      """
      {"requests":2,"firstResult":"exit status: 7\npartial\ncomplete\n","handle":false,"description":true,"exit":0}
      """

  Scenario: Cancellation during the wait stops the command
    When I run the bounded shell wait CLI fixture "cancel"
    Then the bounded shell wait observations are:
      """
      {"requests":1,"aliveBeforeEnd":true,"stoppedPromptly":true,"cleaned":true,"exit":143}
      """

  Scenario: The round deadline during the wait stops the command
    When I run the bounded shell wait CLI fixture "deadline"
    Then the bounded shell wait observations are:
      """
      {"requests":1,"aliveBeforeEnd":true,"stoppedPromptly":true,"cleaned":true,"exit":1,"reason":"deadline"}
      """

  Scenario: A command that outlasts the bound still yields a live handle
    When I run the bounded shell wait CLI fixture "long"
    Then the bounded shell wait observations are:
      """
      {"requests":3,"firstStatus":"running","firstOutput":"partial\n","heldUntilBound":true,"yieldedByBound":true,"aliveAtYield":true,"completed":{"status":"completed","sameHandle":true,"exit_status":7,"output":"partial\ncomplete\n"},"cleaned":true,"exit":0}
      """
