Feature: Transient Anthropic stream faults are retried inside the provider call

  Background:
    Given the Anthropic stream retry fixture is present
    When the Anthropic stream retry cases run against the provider package

  Scenario: An overloaded_error stream event on attempt 1 recovers on attempt 2
    Then the Anthropic stream retry case "recovers_overloaded_error" passes

  Scenario: An api_error stream event on attempt 1 recovers on attempt 2
    Then the Anthropic stream retry case "recovers_api_error" passes

  Scenario: A rate_limit_error stream event on attempt 1 recovers on attempt 2
    Then the Anthropic stream retry case "recovers_rate_limit_error" passes

  Scenario: Three transient stream faults end unavailable after exactly three requests
    Then the Anthropic stream retry case "exhausts_after_three" passes

  Scenario: A stream cut mid-body is retried and recovers
    Then the Anthropic stream retry case "cut_stream_recovers" passes
    And the Anthropic stream retry case "cut_stream_exhausts" passes

  Scenario: Other error types and malformed events are not retried and keep their diagnostics
    Then the Anthropic stream retry case "not_retried_invalid_request_error" passes
    And the Anthropic stream retry case "not_retried_authentication_error" passes
    And the Anthropic stream retry case "not_retried_unknown_type" passes
    And the Anthropic stream retry case "not_retried_missing_type" passes
    And the Anthropic stream retry case "not_retried_malformed_frame" passes

  Scenario: Definite refusals and 401 are not retried
    Then the Anthropic stream retry case "refusal_and_401_not_retried" passes

  Scenario: Cancellation or a spent budget during the wait stops the retry
    Then the Anthropic stream retry case "cancelled_during_wait" passes
    And the Anthropic stream retry case "budget_spent_during_wait" passes

  Scenario: A returned tool-call response is never re-requested
    Then the Anthropic stream retry case "tool_call_response_returned_once" passes

  Scenario: ChatGPT single-attempt behavior is unchanged
    Then the Anthropic stream retry case "single_attempt_provider_unchanged" passes
