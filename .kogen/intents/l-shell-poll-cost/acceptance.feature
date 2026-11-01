Feature: Long shell commands avoid per-second model requests
  Scenario: Runtime within a retrieval window has constant request cost
    When I measure shell commands lasting 4 and 8 seconds
    Then each long command uses 3 model requests and delivers its complete result
