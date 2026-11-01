Feature: Safely accelerate sys tools and loop tests
  Independent tests run in parallel without changing production behavior or coverage.
  The longer before/after measurement gate is separately required by the Intent.

  Scenario: Schedule independent tests by default
    When I run uncached sys tools and loop tests
    Then each scoped package passes with independent top-level parallel tests
