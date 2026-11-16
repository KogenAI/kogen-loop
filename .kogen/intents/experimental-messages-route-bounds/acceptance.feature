Feature: Explicit experimental external Messages route
  This feature covers a local-fixture-only route with stage bounds.

  Scenario: Explicit destination and credential origin
    When experimental-messages-route-bounds: I run the route driver test "TestExternalMessagesDestinationAndRequest"
    Then experimental-messages-route-bounds: the driver test ran and passed

  Scenario: Ambiguous or mismatched destinations send nothing
    When experimental-messages-route-bounds: I run the route driver test "TestExternalMessagesSendsNothingWhenAmbiguous"
    Then experimental-messages-route-bounds: the driver test ran and passed

  Scenario: Stage budget bounds every attempt
    When experimental-messages-route-bounds: I run the route driver test "TestExternalMessagesStageBudgetBounds"
    Then experimental-messages-route-bounds: the driver test ran and passed

  Scenario: Two-turn tool fixture
    When experimental-messages-route-bounds: I run the route driver test "TestExternalMessagesTwoTurnToolFixture"
    Then experimental-messages-route-bounds: the driver test ran and passed

  Scenario: Failed attempts stay counted and visible
    When experimental-messages-route-bounds: I run the route driver test "TestExternalMessagesFailuresStayVisible"
    Then experimental-messages-route-bounds: the driver test ran and passed

  Scenario: Route is declared experimental offline
    When experimental-messages-route-bounds: I run the route driver test "TestExternalMessagesRouteIsDeclaredExperimental"
    Then experimental-messages-route-bounds: the driver test ran and passed

  Scenario: Documentation states the limits
    When experimental-messages-route-bounds: I read the caller contract
    Then experimental-messages-route-bounds: it documents the explicit experimental route, its unsupported parts, the live qualification still needed, the Token Plan prohibition and the held QC studies
