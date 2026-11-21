Feature: Chat Completions response-header wait is bounded and separate from the idle limit

  This feature runs driver tests against a local fixture server on a simulated clock; no test sleeps in real time.

  Scenario: A provider silent for 60 seconds before the headers still answers
    When loop-header-delay-and-plain-json-fixtures: I run the provider test "TestHeaderDriverDelayed60s"
    Then loop-header-delay-and-plain-json-fixtures: the provider test ran and passed

  Scenario: A host that sends no headers fails with an error naming the header wait
    When loop-header-delay-and-plain-json-fixtures: I run the provider test "TestHeaderDriverTimeoutNamesHeaders"
    Then loop-header-delay-and-plain-json-fixtures: the provider test ran and passed

  Scenario: The idle clock starts when the headers arrive
    When loop-header-delay-and-plain-json-fixtures: I run the provider test "TestHeaderDriverIdleClockStartsAtHeaders"
    Then loop-header-delay-and-plain-json-fixtures: the provider test ran and passed

  Scenario: A stream request answered with a plain JSON body returns that answer
    When loop-header-delay-and-plain-json-fixtures: I run the provider test "TestHeaderDriverPlainJSONAnswer"
    Then loop-header-delay-and-plain-json-fixtures: the provider test ran and passed

  Scenario: A streamed tool call round-trips with its arguments
    When loop-header-delay-and-plain-json-fixtures: I run the provider test "TestHeaderDriverToolCallRoundTrip"
    Then loop-header-delay-and-plain-json-fixtures: the provider test ran and passed
