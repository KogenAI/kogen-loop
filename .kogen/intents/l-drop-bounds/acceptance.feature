Feature: Remove optional loop stopping bounds
  The standalone loop has no MaxRounds or Progress stop policy.
  Default requests, tool replay, endings and errors retain their behavior.

  Scenario: Remove L21 and L22 public surfaces
    When I run unused-option contract test "TestDropBoundsRemoved"
    Then unused-option contract test "TestDropBoundsRemoved" passes

  Scenario: Continue repeated calls until an existing ending or error
    When I run unused-option contract test "TestDropBoundsDefaultBehavior"
    Then unused-option contract test "TestDropBoundsDefaultBehavior" passes

  Scenario: Retire bound-only acceptance and maintained option documentation
    When I run unused-option contract test "TestDropBoundsDocumentation"
    Then unused-option contract test "TestDropBoundsDocumentation" passes
