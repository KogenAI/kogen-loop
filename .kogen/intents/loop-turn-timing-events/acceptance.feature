Feature: Turn timing events
  This feature checks that each turn records how its wall time was spent.

  Scenario: Time split of turns
    When loop-turn-timing-events: the split acceptance test runs
    Then loop-turn-timing-events: the test passed

  Scenario: Retry and backoff time
    When loop-turn-timing-events: the backoff acceptance test runs
    Then loop-turn-timing-events: the test passed

  Scenario: The session summary
    When loop-turn-timing-events: the session acceptance test runs
    Then loop-turn-timing-events: the test passed

  Scenario: Placement and cost over 30 turns
    When loop-turn-timing-events: the placement acceptance test runs
    Then loop-turn-timing-events: the test passed
