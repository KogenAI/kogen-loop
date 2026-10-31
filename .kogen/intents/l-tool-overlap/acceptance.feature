Feature: Default streamed tool overlap without compatibility changes
  Scenario Outline: Run the required offline behavioral proof
    When I run the tool overlap behavioral tests
    Then tool overlap test "<test>" must run and pass
    Examples:
      | test                         |
      | TestToolOverlapEarly         |
      | TestToolOverlapOrder         |
      | TestToolOverlapConflicts     |
      | TestToolOverlapAbort         |
      | TestToolOverlapTeardown      |
      | TestToolOverlapHooks         |
      | TestToolOverlapCompatibility |
