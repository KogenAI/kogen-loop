Feature: A provider call that ends as unavailable names its earlier failed attempts
  This feature checks the ChatGPT provider route, scripted with fake HTTP answers and a fake clock, so nothing waits and nothing reaches a network.

  Scenario: three different failures are all named
    Given kogen-loop-unavailable-names-earlier-attempts: the provider package is copied to a scratch module
    When kogen-loop-unavailable-names-earlier-attempts: the ChatGPT route answers with the script "three-different"
    Then kogen-loop-unavailable-names-earlier-attempts: the call ended as unavailable with detail "ChatGPT did not answer after 3 attempts: HTTP 502 rate limited"
    And kogen-loop-unavailable-names-earlier-attempts: 3 requests were made and the waits were 2 s then 8 s
    And kogen-loop-unavailable-names-earlier-attempts: the error lines contain "provider failure: {\"http_status\":502}"
    Then kogen-loop-unavailable-names-earlier-attempts: the error lines contain "earlier attempts: 1 HTTP 429 rate limited; 2 HTTP 503 overloaded"
    And kogen-loop-unavailable-names-earlier-attempts: the error lines are exactly 2

  Scenario: three identical failures add nothing
    Given kogen-loop-unavailable-names-earlier-attempts: the provider package is copied to a scratch module
    When kogen-loop-unavailable-names-earlier-attempts: the ChatGPT route answers with the script "identical"
    Then kogen-loop-unavailable-names-earlier-attempts: the call ended as unavailable with detail "ChatGPT did not answer after 3 attempts: HTTP 429 rate limited"
    And kogen-loop-unavailable-names-earlier-attempts: 3 requests were made and the waits were 2 s then 8 s
    And kogen-loop-unavailable-names-earlier-attempts: the error lines contain "provider failure: {\"http_status\":429}"
    Then kogen-loop-unavailable-names-earlier-attempts: no error line starts with "earlier attempts:"
    And kogen-loop-unavailable-names-earlier-attempts: the error lines are exactly 1

  Scenario: a Retry-After above the bound still names the earlier attempt
    Given kogen-loop-unavailable-names-earlier-attempts: the provider package is copied to a scratch module
    When kogen-loop-unavailable-names-earlier-attempts: the ChatGPT route answers with the script "retry-after-bound"
    Then kogen-loop-unavailable-names-earlier-attempts: the call ended as unavailable with detail "ChatGPT asked to wait 90 s before retrying, more than the 60 s limit: HTTP 503 rate limited"
    And kogen-loop-unavailable-names-earlier-attempts: 2 requests were made and the waits were 2 s
    And kogen-loop-unavailable-names-earlier-attempts: the error lines contain "provider failure: {\"http_status\":503}"
    Then kogen-loop-unavailable-names-earlier-attempts: the error lines contain "earlier attempts: 1 HTTP 429 rate limited"
    And kogen-loop-unavailable-names-earlier-attempts: the error lines are exactly 2
