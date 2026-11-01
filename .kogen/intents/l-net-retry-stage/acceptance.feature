Feature: A short network outage does not end the round
  The real kogen-loop CLI runs one round against a local fake Responses server
  (KOGEN_PROVIDER_URL) whose listener can stop accepting connections, so the
  CLI's connection attempts are refused, and later open again on the same port.
  The script's "outage_seconds" counts from the CLI's first failed
  request.attempt event; "outage_after_request" 0 refuses from the start and
  n closes the listener while answering request n. Non-200 answers carry the
  JSON body {"error":{...}} built from "message", "type" and "code".

  Scenario: A refused-connection outage longer than the retry schedule is waited out and the round keeps its work
    When the CLI runs a round against the outage fake provider:
      """
      {"tools":["write_file"],"outage_after_request":1,"outage_seconds":14,"answers":[
        {"status":200,"call":{"id":"call_1","name":"write_file","arguments":{"path":"progress.txt","content":"step one"}}},
        {"status":200,"text":"done"}]}
      """
    Then the outage run exited with code 0
    And the outage run reported no error event
    And the outage run ended its round after 2 requests with the claim "done"
    And the outage run left the file "progress.txt" containing "step one"
    And the outage run recorded these attempts in order:
      """
      [{"outcome":"completed","end_reason":"complete"},{"outcome":"failed","end_reason":"transport"},{"outcome":"completed","end_reason":"complete"}]
      """
    And the outage fake provider received 2 HTTP requests
    And outage HTTP request 2 carried call "call_1" and its output
    And outage HTTP request 2 arrived within 2.5 seconds after the listener opened again

  Scenario: Waiting adds no attempt, so an origin that comes back failing still ends after 3 attempts
    When the CLI runs a round against the outage fake provider:
      """
      {"outage_after_request":0,"outage_seconds":4,"answers":[
        {"status":503,"retry_after":"0","message":"overloaded"},
        {"status":503,"retry_after":"0","message":"overloaded"},
        {"status":503,"retry_after":"0","message":"overloaded"}]}
      """
    Then the outage run exited with code 1
    And the outage run reported the error event:
      """
      {"class":"provider","reason":"unavailable","detail":"ChatGPT did not answer after 3 attempts: HTTP 503 overloaded"}
      """
    And the outage run recorded these attempts in order:
      """
      [{"outcome":"failed","end_reason":"transport"},{"outcome":"failed","end_reason":null},{"outcome":"failed","end_reason":null}]
      """
    And the outage fake provider received 2 HTTP requests

  Scenario: An origin that never accepts a connection is waited for without another attempt until the round's deadline
    When the CLI runs a round against the outage fake provider:
      """
      {"outage_after_request":0,"outage_seconds":null,"deadline_seconds":6,"answers":[]}
      """
    Then the outage run exited with code 1
    And the outage run reported the error event:
      """
      {"class":"loop","reason":"deadline","detail":"the round did not end within 6 seconds"}
      """
    And the outage run recorded these attempts in order:
      """
      [{"outcome":"failed","end_reason":"transport"}]
      """
    And the outage fake provider received 0 HTTP requests

  Scenario: A provider that answers with a refusal still fails at once as today
    When the CLI runs a round against the outage fake provider:
      """
      {"answers":[{"status":400,"message":"bad request","type":"invalid_request_error","code":"invalid_value"}]}
      """
    Then the outage run exited with code 1
    And the outage run reported the error event:
      """
      {"class":"provider","reason":"refused","detail":"ChatGPT refused the request: 400 bad request"}
      """
    And the outage run recorded these attempts in order:
      """
      [{"outcome":"failed","end_reason":null}]
      """
    And the outage fake provider received 1 HTTP request

  Scenario: A provider that answers with temporary errors still ends after 3 attempts as today, without waiting
    When the CLI runs a round against the outage fake provider:
      """
      {"answers":[
        {"status":503,"retry_after":"0","message":"overloaded"},
        {"status":503,"retry_after":"0","message":"overloaded"},
        {"status":503,"retry_after":"0","message":"overloaded"}]}
      """
    Then the outage run exited with code 1
    And the outage run reported the error event:
      """
      {"class":"provider","reason":"unavailable","detail":"ChatGPT did not answer after 3 attempts: HTTP 503 overloaded"}
      """
    And the outage run recorded these attempts in order:
      """
      [{"outcome":"failed","end_reason":null},{"outcome":"failed","end_reason":null},{"outcome":"failed","end_reason":null}]
      """
    And the outage fake provider received 3 HTTP requests
    And the outage run ended within 2 seconds of the first HTTP request
