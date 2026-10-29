Feature: Remove queued experimental levers
  The fixed behavior is no prefix events, no ledger, no reminders,
  full descriptions and view_image offered without an omission switch.

  Scenario: Remove the complete optional public surface
    When I run unused-option contract test "TestQueuedLeversRemoved"
    Then unused-option contract test "TestQueuedLeversRemoved" passes

  Scenario: Delete obsolete tests and current option documentation
    When I run unused-option contract test "TestQueuedLeverCleanup"
    Then unused-option contract test "TestQueuedLeverCleanup" passes

  Scenario: Exercise fixed defaults through the real loop and tools
    When I run unused-option contract test "TestQueuedLeverDefaults"
    Then unused-option contract test "TestQueuedLeverDefaults" passes
