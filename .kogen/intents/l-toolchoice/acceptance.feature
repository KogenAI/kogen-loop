Feature: Named API-level provider tool choice
  Scenario: Supporting routes require submit without other changes
    When I run the named tool choice provider tests
    Then named tool choice test "TestToolChoiceTransport" must pass for Responses choice '{"type":"function","name":"submit"}' and Chat choice '{"type":"function","function":{"name":"submit"}}'

  Scenario: Empty choice preserves every route byte for byte
    When I run the named tool choice provider tests
    Then named tool choice test "TestToolChoiceEmptyBytes" must pass

  Scenario: Unsupported profiles refuse before network
    When I run the named tool choice provider tests
    Then named tool choice test "TestToolChoiceUnsupported" must pass
