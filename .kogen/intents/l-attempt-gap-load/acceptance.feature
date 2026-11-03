Feature: Attempt records carry their offset from the request start and the host load
  The real kogen-loop CLI runs one round against a local fake ChatGPT server
  (KOGEN_PROVIDER_URL and KOGEN_AUTH_URL). Every request.attempt event's record keeps
  its existing keys and adds request_offset_ms, the integer milliseconds from the
  request start to the attempt start, and load_average, the host's 1, 5 and 15 minute
  load average at the attempt start, compared with the host's own readings
  (sysctl -n vm.loadavg on darwin, /proc/loadavg on linux) taken before and after the run.

  Scenario: A single attempt records its offset and the host load
    When the CLI makes one request to a fake ChatGPT answering:
      """
      {"answers":[{"status":200}]}
      """
    Then the run made 1 attempt and 0 token refreshes
    And the gap run exited with code 0
    And attempt 1 record has its existing keys plus load_average and request_offset_ms
    And attempt 1 started at least 0 and under 1000 ms after the request started
    And attempt 1 carries the host load average at its start

  Scenario: Time spent before the first attempt counts in its offset
    When the CLI makes one request to a fake ChatGPT answering:
      """
      {"answers":[{"status":200}],"refresh_delay_ms":1500}
      """
    Then the run made 1 attempt and 1 token refresh
    And the gap run exited with code 0
    And attempt 1 record has its existing keys plus load_average and request_offset_ms
    And attempt 1 started at least 1450 and under 4500 ms after the request started
    And attempt 1 carries the host load average at its start

  Scenario: A retried attempt records its later offset from the same request start
    When the CLI makes one request to a fake ChatGPT answering:
      """
      {"answers":[{"status":429,"retry_after":"1"},{"status":200}]}
      """
    Then the run made 2 attempts and 0 token refreshes
    And the gap run exited with code 0
    And attempt 1 record has its existing keys plus load_average and request_offset_ms
    And attempt 2 record has its existing keys plus load_average and request_offset_ms
    And attempt 1 started at least 0 and under 1000 ms after the request started
    And attempt 2 started at least 1000 and under 3000 ms after the request started
    And attempt 2 started after attempt 1 ended and a 1000 ms wait, by its request offset and its timestamp
    And attempt 1 carries the host load average at its start
    And attempt 2 carries the host load average at its start
