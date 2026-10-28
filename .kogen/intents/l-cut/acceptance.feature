Feature: Configurable tool result cut budgets
  Scenario Outline: Public behavior coverage
    When I run the L-CUT test "<test>" in "<package>"
    Then the L-CUT named test passes
    Examples:
      | package | test                  |
      | tools   | TestLCutDefaults      |
      | tools   | TestLCutConfigured    |
      | tools   | TestLCutUTF8AndTyped  |
      | tools   | TestLCutValidation    |
      | loop    | TestLCutLoopDelivery  |
