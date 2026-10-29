Feature: Remove five unused loop options
  Existing default behavior is the only behavior, without replacement options.

  Scenario: Removed API members cannot be used
    When I run unused-option contract test "TestUnusedOptionsRemoved"
    Then unused-option contract test "TestUnusedOptionsRemoved" passes

  Scenario: Preserve complete batches and last-terminal results
    When I run unused-option contract test "TestEngineOrder"
    Then unused-option contract test "TestEngineOrder" passes

  Scenario: Preserve refusal before transport without clipping
    When I run unused-option contract test "TestOverBudgetRefusalComesBeforeAnyRequestAndTheInputIsNeverClipped"
    Then unused-option contract test "TestOverBudgetRefusalComesBeforeAnyRequestAndTheInputIsNeverClipped" passes
