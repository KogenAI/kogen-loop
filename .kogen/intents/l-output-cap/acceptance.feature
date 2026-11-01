Feature: End a streamed response whose visible output runs far past any normal turn
  The real kogen-loop CLI runs one round against a local fake provider (KOGEN_PROVIDER_URL)
  that streams ChatGPT Responses or Anthropic Messages. A "runaway" answer streams 1024-byte
  visible-output deltas until the client closes the connection or 512000 bytes (about the
  128000-token output cap) were sent, then ends the way the provider ends at its output cap.
  An attempt whose visible output passes 131072 bytes is a failed attempt, retried by the
  existing policy: 2 s then 8 s backoff, at most 3 attempts.

  Background:
    Given the output-cap kogen-loop CLI is built

  Scenario: A ChatGPT response that never stops its visible output is cut off and the retry answers
    When the output-cap CLI runs a "chatgpt" round against a fake provider scripted as:
      """
      [{"kind":"runaway","delta":1024,"cap":512000},{"kind":"answer","text":"done"}]
      """
    Then the output-cap fake received 2 requests
    And output-cap attempt 1 failed with end_reason "output_limit"
    And output-cap attempt 1 read more than 131072 and fewer than 262144 stream bytes
    And the output-cap wait before request 2 was at least 1.9 and under 2.9 seconds
    And output-cap attempt 2 completed
    And the output-cap CLI exited with code 0
    And the output-cap round ended without a tool call
    And the output-cap CLI reported no error

  Scenario: A runaway on every attempt stops the run with the existing exhaustion error
    When the output-cap CLI runs a "chatgpt" round against a fake provider scripted as:
      """
      [{"kind":"runaway","delta":1024,"cap":512000},{"kind":"runaway","delta":1024,"cap":512000},{"kind":"runaway","delta":1024,"cap":512000}]
      """
    Then the output-cap fake received 3 requests
    And output-cap attempt 1 failed with end_reason "output_limit"
    And output-cap attempt 1 read more than 131072 and fewer than 262144 stream bytes
    And output-cap attempt 2 failed with end_reason "output_limit"
    And output-cap attempt 2 read more than 131072 and fewer than 262144 stream bytes
    And output-cap attempt 3 failed with end_reason "output_limit"
    And output-cap attempt 3 read more than 131072 and fewer than 262144 stream bytes
    And the output-cap wait before request 2 was at least 1.9 and under 2.9 seconds
    And the output-cap wait before request 3 was at least 7.9 and under 9.5 seconds
    And the output-cap CLI exited with code 1
    And the output-cap CLI reported the error:
      """
      {"class":"provider","reason":"unavailable","detail":"ChatGPT did not answer after 3 attempts: visible output exceeded 131072 bytes"}
      """

  Scenario: A long normal ChatGPT answer of exactly 131072 visible bytes completes unchanged
    When the output-cap CLI runs a "chatgpt" round against a fake provider scripted as:
      """
      [{"kind":"long","visible":131072,"reasoning":0,"delta":1024}]
      """
    Then the output-cap fake received 1 request
    And output-cap attempt 1 completed
    And output-cap attempt 1 read more than 131072 and fewer than 1048576 stream bytes
    And the output-cap CLI exited with code 0
    And the output-cap round ended without a tool call
    And the output-cap CLI reported no error

  Scenario: A ChatGPT answer one visible byte over the limit is cut although it would complete
    When the output-cap CLI runs a "chatgpt" round against a fake provider scripted as:
      """
      [{"kind":"long","visible":131073,"reasoning":0,"delta":1024},{"kind":"answer","text":"done"}]
      """
    Then the output-cap fake received 2 requests
    And output-cap attempt 1 failed with end_reason "output_limit"
    And output-cap attempt 2 completed
    And the output-cap CLI exited with code 0
    And the output-cap round ended without a tool call

  Scenario: Long ChatGPT reasoning text is not visible output
    When the output-cap CLI runs a "chatgpt" round against a fake provider scripted as:
      """
      [{"kind":"long","visible":4096,"reasoning":300000,"delta":1024}]
      """
    Then the output-cap fake received 1 request
    And output-cap attempt 1 completed
    And the output-cap CLI exited with code 0
    And the output-cap round ended without a tool call
    And the output-cap CLI reported no error

  Scenario: An Anthropic response that never stops its visible output is cut off and the retry answers
    When the output-cap CLI runs a "anthropic" round against a fake provider scripted as:
      """
      [{"kind":"runaway","delta":1024,"cap":512000},{"kind":"answer","text":"done"}]
      """
    Then the output-cap fake received 2 requests
    And output-cap attempt 1 failed with end_reason "output_limit"
    And output-cap attempt 1 read more than 131072 and fewer than 262144 stream bytes
    And the output-cap wait before request 2 was at least 1.9 and under 2.9 seconds
    And output-cap attempt 2 completed
    And the output-cap CLI exited with code 0
    And the output-cap round ended without a tool call
    And the output-cap CLI reported no error

  Scenario: A long normal Anthropic answer after long thinking completes unchanged
    When the output-cap CLI runs a "anthropic" round against a fake provider scripted as:
      """
      [{"kind":"long","visible":131072,"reasoning":300000,"delta":1024}]
      """
    Then the output-cap fake received 1 request
    And output-cap attempt 1 completed
    And the output-cap CLI exited with code 0
    And the output-cap round ended without a tool call
    And the output-cap CLI reported no error
