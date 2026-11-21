Feature: The response-header wait is bounded on the Messages and Responses routes

  This feature runs driver tests against a local fixture server on a simulated clock; no test sleeps for the simulated durations.

  Scenario: Messages headers held for 60 seconds then a normal answer succeeds first time
    When loop-header-wait-on-messages-responses: I run the provider test "TestHeaderWaitDriverMessages60s"
    Then loop-header-wait-on-messages-responses: the provider test ran and passed

  Scenario: Responses headers held for 100 seconds on ChatGPT then a normal answer succeeds first time
    When loop-header-wait-on-messages-responses: I run the provider test "TestHeaderWaitDriverResponses100s"
    Then loop-header-wait-on-messages-responses: the provider test ran and passed

  Scenario: Messages headers that never come end at the default header timeout naming the headers
    When loop-header-wait-on-messages-responses: I run the provider test "TestHeaderWaitDriverMessagesNeverHeaders"
    Then loop-header-wait-on-messages-responses: the provider test ran and passed

  Scenario: A configured 30 second header timeout ends the wait at 30 seconds naming the headers
    When loop-header-wait-on-messages-responses: I run the provider test "TestHeaderWaitDriverMessagesConfiguredTimeout"
    Then loop-header-wait-on-messages-responses: the provider test ran and passed

  Scenario: The first event 40 seconds after late headers is not cut
    When loop-header-wait-on-messages-responses: I run the provider test "TestHeaderWaitDriverMessagesFirstEventAfterHeaders"
    Then loop-header-wait-on-messages-responses: the provider test ran and passed

  Scenario: Silence after late headers ends 45 seconds after the headers with the first byte detail
    When loop-header-wait-on-messages-responses: I run the provider test "TestHeaderWaitDriverMessagesSilenceAfterHeaders"
    Then loop-header-wait-on-messages-responses: the provider test ran and passed
