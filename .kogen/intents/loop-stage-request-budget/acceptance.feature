Feature: Bound real provider requests within one stage

  This feature drives the library API against a deterministic fake provider.

  Scenario: Two shared requests are the boundary even with concurrent callers
    When loop-stage-request-budget: I run the stage budget driver test "TestStageBudgetSharedAndConcurrent" in "provider"
    Then loop-stage-request-budget: the driver test ran and passed

  Scenario: Retries consume the shared request count
    When loop-stage-request-budget: I run the stage budget driver test "TestStageBudgetRetriesConsumeTheSameCount" in "provider"
    Then loop-stage-request-budget: the driver test ran and passed

  Scenario: Expired deadline and failed reservation persistence make no call
    When loop-stage-request-budget: I run the stage budget driver test "TestStageBudgetNoCallRefusalsAndFailClosedPersistence" in "provider"
    Then loop-stage-request-budget: the driver test ran and passed

  Scenario: A restored reservation count continues the stage
    When loop-stage-request-budget: I run the stage budget driver test "TestStageBudgetSnapshotRestore" in "provider"
    Then loop-stage-request-budget: the driver test ran and passed

  Scenario: The rendered input byte limit is exact
    When loop-stage-request-budget: I run the stage budget driver test "TestStageBudgetInputBytesAreExact" in "provider"
    Then loop-stage-request-budget: the driver test ran and passed

  Scenario: The output ceiling is sent where supported and refused elsewhere
    When loop-stage-request-budget: I run the stage budget driver test "TestStageBudgetOutputCeilingWireSupport" in "provider"
    Then loop-stage-request-budget: the driver test ran and passed

  Scenario: Invalid limits are refused
    When loop-stage-request-budget: I run the stage budget driver test "TestStageBudgetValidation" in "provider"
    Then loop-stage-request-budget: the driver test ran and passed

  Scenario: No limits keep behavior and the parent context wins
    When loop-stage-request-budget: I run the stage budget driver test "TestStageBudgetCompatibilityAndParent" in "provider"
    Then loop-stage-request-budget: the driver test ran and passed

  Scenario: The direct loop requester shares one counter across rounds
    When loop-stage-request-budget: I run the stage budget driver test "TestStageBudgetDirectSharesOneCounterAcrossRounds" in "loop"
    Then loop-stage-request-budget: the driver test ran and passed

  Scenario: Condensation requests count against the same budget
    When loop-stage-request-budget: I run the stage budget driver test "TestStageBudgetCondensationSharesTheCount" in "loop"
    Then loop-stage-request-budget: the driver test ran and passed
