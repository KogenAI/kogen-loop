Feature: Honour Retry-After on rate-limited provider answers
  The real kogen-loop CLI runs one round against a local fake Responses server
  (KOGEN_PROVIDER_URL). A rate-limited answer is HTTP 429 or 503 with the body
  {"error":{"message":"rate limited"}} and, when given, a Retry-After header.

  Scenario: A 429 with Retry-After 3 is retried after about 3 s, not 2 s
    When the CLI runs against a fake provider answering:
      """
      [{"status":429,"retry_after":"3"},{"status":200}]
      """
    Then the fake provider received 2 requests
    And the wait before request 2 was at least 2.9 and under 4.5 seconds
    And the CLI exited with code 0

  Scenario: A 503 with Retry-After 3 is retried after about 3 s, not 2 s
    When the CLI runs against a fake provider answering:
      """
      [{"status":503,"retry_after":"3"},{"status":200}]
      """
    Then the fake provider received 2 requests
    And the wait before request 2 was at least 2.9 and under 4.5 seconds
    And the CLI exited with code 0

  Scenario: Without Retry-After the 2 s then 8 s schedule and three attempts stay
    When the CLI runs against a fake provider answering:
      """
      [{"status":429},{"status":429},{"status":429}]
      """
    Then the fake provider received 3 requests
    And the wait before request 2 was at least 1.9 and under 2.9 seconds
    And the wait before request 3 was at least 7.9 and under 9.5 seconds
    And the CLI exited with code 1
    And the CLI reported the error:
      """
      {"class":"provider","reason":"unavailable","detail":"ChatGPT did not answer after 3 attempts: HTTP 429 rate limited"}
      """

  Scenario: Advertised waits are honoured on every retry and the attempt count stays three
    When the CLI runs against a fake provider answering:
      """
      [{"status":429,"retry_after":"1"},{"status":503,"retry_after":"1"},{"status":429,"retry_after":"1"}]
      """
    Then the fake provider received 3 requests
    And the wait before request 2 was at least 0.9 and under 1.9 seconds
    And the wait before request 3 was at least 0.9 and under 1.9 seconds
    And the CLI exited with code 1
    And the CLI reported the error:
      """
      {"class":"provider","reason":"unavailable","detail":"ChatGPT did not answer after 3 attempts: HTTP 429 rate limited"}
      """

  Scenario: A Retry-After above the 60 s bound fails at once naming the advertised wait
    When the CLI runs against a fake provider answering:
      """
      [{"status":429,"retry_after":"61"},{"status":200}]
      """
    Then the fake provider received 1 request
    And the CLI ended within 1.5 seconds of the first request
    And the CLI exited with code 1
    And the CLI reported the error:
      """
      {"class":"provider","reason":"unavailable","detail":"ChatGPT asked to wait 61 s before retrying, more than the 60 s limit: HTTP 429 rate limited"}
      """

  Scenario: A Retry-After of exactly 60 s is within the bound and is waited
    When the CLI runs against a fake provider answering, stopped 4.0 seconds after the first request:
      """
      [{"status":429,"retry_after":"60"},{"status":200}]
      """
    Then the fake provider received 1 request
    And the CLI was still waiting when it was stopped
