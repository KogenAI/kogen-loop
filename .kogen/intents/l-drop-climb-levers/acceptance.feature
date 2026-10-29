Feature: Remove climb levers without changing defaults
  The fixed policy is a 524288-byte input window, 16384/4096 text cut,
  16384/8388608 documentation limits, provider-default parallel calls,
  and three default cache breakpoints. No new CLI option replaces these levers.

  Scenario: Removed APIs and option-only fixtures are gone
    When I run unused-option contract test "TestClimbLeversRemoved"
    Then unused-option contract test "TestClimbLeversRemoved" passes

  Scenario: Fixed policies work through the real loop and provider boundary
    When I run unused-option contract test "TestClimbLeverConstants"
    Then unused-option contract test "TestClimbLeverConstants" passes
