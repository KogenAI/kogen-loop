Feature: Lower-only provider client response budgets
  The Go client defaults to 30 minutes and allows research callers to lower it.

  Scenario Outline: Execute the client budget behavioral contract
    When I run response budget behavior test "<test>"
    Then response budget behavior test "<test>" passes

    Examples:
      | test                                |
      | TestClientResponseBudgetDefault     |
      | TestClientResponseBudgetValidation  |
      | TestClientResponseBudgetPrecedence  |
      | TestClientResponseBudgetStall       |
      | TestClientResponseBudgetAbsolute    |
      | TestClientResponseBudgetDiagnostic  |
