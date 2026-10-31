Feature: Continue within the request budget without losing older work
  Scenario Outline: Budget behavior is exercised through required observable tests
    When I run request budget test "<test>" in "<package>"
    Then request budget test "<test>" in "<package>" ran and passed
    Examples:
      | test                       | package       |
      | TestRequestBudgetBoundary  | ./loop        |
      | TestRequestBudgetRetention | ./conformance |
      | TestRequestBudgetFailures  | ./loop        |
      | TestRequestBudgetCLI       | ./conformance |
