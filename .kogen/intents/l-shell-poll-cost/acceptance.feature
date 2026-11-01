Feature: Shell commands within the wait avoid fetch requests
  Scenario: Runtime within the initial wait has constant request cost
    When I measure shell commands lasting 4 and 8 seconds
    Then each command uses 2 model requests and delivers its complete result in the first tool response
