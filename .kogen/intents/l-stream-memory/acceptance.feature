Feature: Bound memory for a streaming provider response
  Scenario: Reject oversized streams while preserving the boundary and normal answers
    When I run the streaming memory regression
    Then the required streaming memory regression "TestLStreamMemory" passes without missing or skipped coverage
