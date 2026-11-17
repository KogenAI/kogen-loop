Feature: Unsigned thinking on the external Messages route
  This feature covers local fixtures only; no provider is called.

  Scenario: Recorded external response is accepted
    When external-messages-unsigned-thinking: I run the driver test "TestUTRecordedExternalResponseIsAccepted"
    Then external-messages-unsigned-thinking: the driver test "TestUTRecordedExternalResponseIsAccepted" ran and passed

  Scenario: Absent signature is unsigned and bad types stay invalid
    When external-messages-unsigned-thinking: I run the driver test "TestUTAbsentSignatureIsUnsignedAndBadTypesStayInvalid"
    Then external-messages-unsigned-thinking: the driver test "TestUTAbsentSignatureIsUnsignedAndBadTypesStayInvalid" ran and passed

  Scenario: Tool cycle keeps provider thinking
    When external-messages-unsigned-thinking: I run the driver test "TestUTExternalToolCycleKeepsProviderThinking"
    Then external-messages-unsigned-thinking: the driver test "TestUTExternalToolCycleKeepsProviderThinking" ran and passed

  Scenario: Strict Anthropic rejects unsigned thinking
    When external-messages-unsigned-thinking: I run the driver test "TestUTStrictAnthropicStillRequiresSignature"
    Then external-messages-unsigned-thinking: the driver test "TestUTStrictAnthropicStillRequiresSignature" ran and passed

  Scenario: Malformed or duplicate tools reject the whole response
    When external-messages-unsigned-thinking: I run the driver test "TestUTMalformedOrDuplicateToolsRejectWholeResponse"
    Then external-messages-unsigned-thinking: the driver test "TestUTMalformedOrDuplicateToolsRejectWholeResponse" ran and passed

  Scenario: Cut stream and stop and usage handling are unchanged
    When external-messages-unsigned-thinking: I run the driver test "TestUTCutStreamAndStopHandlingUnchanged"
    Then external-messages-unsigned-thinking: the driver test "TestUTCutStreamAndStopHandlingUnchanged" ran and passed
