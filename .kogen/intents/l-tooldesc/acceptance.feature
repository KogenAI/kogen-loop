Feature: Library compact tool description option
  Scenario: Compact descriptions preserve the contract while reducing bytes
    When I run the L-TOOLDESC compact contract test
    Then the L-TOOLDESC test "TestLTooldescCompact" runs and passes
