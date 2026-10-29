Feature: Responses protocol fault regressions
  Scenario: Refusal explanations survive the public CLI boundary
    When the provider proto regression "TestProviderProtoRefusalClaim" runs in "./conformance"
    Then that provider proto regression ran and passed

  Scenario: Duplicate call identities never authorize side effects
    When the provider proto regression "TestProviderProtoDuplicateCalls" runs in "./conformance"
    Then that provider proto regression ran and passed

  Scenario: Terminal failures retain reported accounting
    When the provider proto regression "TestProviderProtoTerminalAccounting" runs in "./provider"
    Then that provider proto regression ran and passed

  Scenario: Failed and discarded attempts retain bounded diagnostics
    When the provider proto regression "TestProviderProtoAttemptDiagnostics" runs in "./provider"
    Then that provider proto regression ran and passed

  Scenario: Existing normal behavior and all checks remain valid
    When the provider proto compatibility checks run
    Then all provider proto compatibility checks pass
