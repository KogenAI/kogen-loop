Feature: Chat route output cap and length cut-off outcome
  This feature covers the Chat Completions route against local fixtures only: no model, key or network is used.

  Scenario: The stage output ceiling is the Chat output-token limit
    When chat-route-output-cap-and-truncation-outcome: I run the provider test "TestChatCapCeilingIsCarriedAsMaxTokens"
    Then chat-route-output-cap-and-truncation-outcome: the provider test ran and passed

  Scenario: A ceiling above the output reserve is still rejected
    When chat-route-output-cap-and-truncation-outcome: I run the provider test "TestChatCapCeilingAboveReserveIsRejected"
    Then chat-route-output-cap-and-truncation-outcome: the provider test ran and passed

  Scenario: A length finish is a named retryable outcome
    When chat-route-output-cap-and-truncation-outcome: I run the provider test "TestChatCapLengthIsANamedRetryableOutcome"
    Then chat-route-output-cap-and-truncation-outcome: the provider test ran and passed

  Scenario: Messages and Responses keep their output-limit behaviour
    When chat-route-output-cap-and-truncation-outcome: I run the provider test "TestChatCapOtherWiresKeepTheirBehaviour"
    Then chat-route-output-cap-and-truncation-outcome: the provider test ran and passed

  Scenario: Stop and tool_calls answers keep their results
    When chat-route-output-cap-and-truncation-outcome: I run the provider test "TestOpenCodeGoWireRecordAndUsage"
    Then chat-route-output-cap-and-truncation-outcome: the provider test ran and passed
    When chat-route-output-cap-and-truncation-outcome: I run the provider test "TestOpenCodeGoRawReplayIsLosslessAndOrdered"
    Then chat-route-output-cap-and-truncation-outcome: the provider test ran and passed
    When chat-route-output-cap-and-truncation-outcome: I run the provider test "TestOpenCodeGoUsageNormalization"
    Then chat-route-output-cap-and-truncation-outcome: the provider test ran and passed

  Scenario: The streaming output-limit test is unchanged
    When chat-route-output-cap-and-truncation-outcome: I run the provider test "TestOutputLimitThinkingIsNotVisible"
    Then chat-route-output-cap-and-truncation-outcome: the provider test ran and passed
