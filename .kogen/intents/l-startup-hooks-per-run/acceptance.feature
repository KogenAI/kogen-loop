Feature: Shell-start test hooks are carried by each session
  sys.Session.StartHook is a test seam carried by the session: a shell start on that session
  calls it at "enter", "starting" and "started"; production leaves it nil. A loop run carries
  it as the session of its Round.Tools. No package-level hook variable remains, so the cancel
  and deadline startup tests and the loop teardown's starting-shell case run in parallel.

  Scenario: Two startup rounds held at different stages at the same time do not see each other's hook
    When l-startup-hooks-per-run: I run the concurrent startup harness under -race
    Then l-startup-hooks-per-run: each round stopped at its own stage and neither was released or blocked by the other's hook

  Scenario: The cancel and deadline startup tests run in parallel and overlap under -race
    When l-startup-hooks-per-run: I run the cancel and deadline startup tests under -race with parallel scheduling
    Then l-startup-hooks-per-run: every startup test and subtest ran and passed
    And l-startup-hooks-per-run: every startup test and subtest is marked parallel
    And l-startup-hooks-per-run: the six startup rounds together took no longer than the longest single round plus 1 second

  Scenario: The loop teardown test's starting-shell case runs in parallel on its own session's hook
    When l-startup-hooks-per-run: I run the loop teardown test under -race
    Then l-startup-hooks-per-run: the loop teardown test and its starting-shell case ran and passed
    And l-startup-hooks-per-run: the starting-shell teardown case is marked parallel

  Scenario: No package-level shell-start hook variable remains in sys or the loop tests' support code
    When l-startup-hooks-per-run: I scan sys and the loop tests' support code for shell-start hook variables
    Then l-startup-hooks-per-run: no package-level shell-start hook variable or go:linkname into sys is found

  Scenario: A session without a start hook produces the same events, results and request bodies as before
    Given l-startup-hooks-per-run: sys.Session has the start hook field "Session.StartHook"
    When l-startup-hooks-per-run: I run the built CLI on a session without a start hook
    Then l-startup-hooks-per-run: the outputs delivered to the model are:
      """
      {"one":"exit status: 0\nl-shp-one\n","two":"exit status: 3\nl-shp-two\n"}
      """
    And l-startup-hooks-per-run: the masked events of the no-hook session are:
      """
      {"capabilities_digest":"420a454cffa92ce1bb57bcd8db2f05250271af9dbcf2dc0fdc2cb0357e963ad1","protocol":"kogen-loop/v1","resumed":false,"role":{"provider":"chatgpt","model":"fixture-model","effort":"medium","base_url":""},"seq":1,"session_id":"<v>","time":"<v>","type":"session.started"}
      {"effort":"medium","model":"fixture-model","n":1,"owner":"loop","protocol":"kogen-loop/v1","seq":2,"time":"<v>","type":"request.started"}
      {"n":1,"protocol":"kogen-loop/v1","record":{"attempt_id":"<v>","cache":{"applied_mode":null,"applied_ttl":null,"boundaries":[],"comparison_response_id":null,"configured_mode":"implicit","configured_ttl":null,"diagnostics":null,"status":"applied"},"compatibility":{"effort":"medium","model":"fixture-model","profile":null,"provider":"chatgpt","role":"","status":"experimental"},"configured_effort":"medium","configured_model":"fixture-model","conversation_id":"<v>","effective_effort":null,"effective_model":null,"effective_reasoning_context":null,"effective_service_tier":null,"end_reason":"complete","error":null,"fingerprints":{"contract":{"bytes":12,"sha256":"73921e2b031698b8c0eab172d70ea1552350e568dd019f0fe99871a8549d06c6"},"policy":{"bytes":480,"sha256":"d74b2fb9b49089c8f47b5c7257258c0a63c7442a36b5e5125b2d7c6fa99fcf1c"},"prefix":{"bytes":1541,"sha256":"2e2c70794e172cb6f32327831118393dc5d23c8417cef13d7bbc077575b354e1"},"schema":{"bytes":275,"sha256":"c213ddb4571a6394036326a57be7f1fab27580c6d014de59388f3108033c3172"},"tools":{"bytes":1041,"sha256":"cc803755a8093ca8edd5c72fb4d50e7bccd11dc55288ecd9c6e1fd76c41feb45"}},"first_byte_ms":"<v>","gap_hist":"<v>","headers_ms":"<v>","last_byte_ms":"<v>","last_progress_ms":"<v>","load_average":"<v>","max_gap_ms":"<v>","operation_id":"<v>","outcome":"completed","provider":"chatgpt","provider_request_id":null,"provider_response_id":"resp-1","request_offset_ms":"<v>","requested_reasoning_context":null,"requested_service_tier":null,"stream_bytes":391,"timestamp":"<v>","ttft_ms":"<v>","usage":{"cached":0,"input":3,"output":3,"reasoning":0,"write":null,"write_12h":null,"write_30m":null},"usage_state":"partial","wall_ms":"<v>"},"seq":3,"time":"<v>","type":"request.attempt"}
      {"n":1,"protocol":"kogen-loop/v1","response_id":"resp-1","seq":4,"time":"<v>","type":"response","usage":{"input":3,"cached":0,"output":3,"reasoning":0,"state":"complete","source":"provider"}}
      {"arguments_sha256":"e3f224495bed6d5f65302464c6b1dacfc8ad4ead94a68680521a8a282830b9f8","call_id":"one","name":"shell","protocol":"kogen-loop/v1","seq":5,"time":"<v>","type":"tool.call"}
      {"bytes":25,"call_id":"one","cut":false,"exit_status":0,"name":"shell","protocol":"kogen-loop/v1","result_sha256":"400a6beb6a7ac5ca33c8636a74c7afe86de87e3c959d05265572af14c4f21954","seq":6,"shell_wait":{"ended_by":"exit","spawned":"<v>","wait_ended":"<v>","wait_started":"<v>"},"time":"<v>","type":"tool.result"}
      {"effort":"medium","model":"fixture-model","n":2,"owner":"loop","protocol":"kogen-loop/v1","seq":7,"time":"<v>","type":"request.started"}
      {"n":2,"protocol":"kogen-loop/v1","record":{"attempt_id":"<v>","cache":{"applied_mode":null,"applied_ttl":null,"boundaries":[],"comparison_response_id":null,"configured_mode":"implicit","configured_ttl":null,"diagnostics":null,"status":"applied"},"compatibility":{"effort":"medium","model":"fixture-model","profile":null,"provider":"chatgpt","role":"","status":"experimental"},"configured_effort":"medium","configured_model":"fixture-model","conversation_id":"<v>","effective_effort":null,"effective_model":null,"effective_reasoning_context":null,"effective_service_tier":null,"end_reason":"complete","error":null,"fingerprints":{"contract":{"bytes":12,"sha256":"73921e2b031698b8c0eab172d70ea1552350e568dd019f0fe99871a8549d06c6"},"policy":{"bytes":480,"sha256":"d74b2fb9b49089c8f47b5c7257258c0a63c7442a36b5e5125b2d7c6fa99fcf1c"},"prefix":{"bytes":1541,"sha256":"2e2c70794e172cb6f32327831118393dc5d23c8417cef13d7bbc077575b354e1"},"schema":{"bytes":275,"sha256":"c213ddb4571a6394036326a57be7f1fab27580c6d014de59388f3108033c3172"},"tools":{"bytes":1041,"sha256":"cc803755a8093ca8edd5c72fb4d50e7bccd11dc55288ecd9c6e1fd76c41feb45"}},"first_byte_ms":"<v>","gap_hist":"<v>","headers_ms":"<v>","last_byte_ms":"<v>","last_progress_ms":"<v>","load_average":"<v>","max_gap_ms":"<v>","operation_id":"<v>","outcome":"completed","provider":"chatgpt","provider_request_id":null,"provider_response_id":"resp-2","request_offset_ms":"<v>","requested_reasoning_context":null,"requested_service_tier":null,"stream_bytes":399,"timestamp":"<v>","ttft_ms":"<v>","usage":{"cached":0,"input":3,"output":3,"reasoning":0,"write":null,"write_12h":null,"write_30m":null},"usage_state":"partial","wall_ms":"<v>"},"seq":8,"time":"<v>","type":"request.attempt"}
      {"n":2,"protocol":"kogen-loop/v1","response_id":"resp-2","seq":9,"time":"<v>","type":"response","usage":{"input":3,"cached":0,"output":3,"reasoning":0,"state":"complete","source":"provider"}}
      {"arguments_sha256":"fe8600c26e97e95d447f4b725f6659b2a88a1b897d32c02329cd922c5c3b7ddb","call_id":"two","name":"shell","protocol":"kogen-loop/v1","seq":10,"time":"<v>","type":"tool.call"}
      {"bytes":25,"call_id":"two","cut":false,"exit_status":3,"name":"shell","protocol":"kogen-loop/v1","result_sha256":"c4f4b491cfb3fbe8465195ba8605c4b352ac67d5750b60d6d0c2d02f57467801","seq":11,"shell_wait":{"ended_by":"exit","spawned":"<v>","wait_ended":"<v>","wait_started":"<v>"},"time":"<v>","type":"tool.result"}
      {"effort":"medium","model":"fixture-model","n":3,"owner":"loop","protocol":"kogen-loop/v1","seq":12,"time":"<v>","type":"request.started"}
      {"n":3,"protocol":"kogen-loop/v1","record":{"attempt_id":"<v>","cache":{"applied_mode":null,"applied_ttl":null,"boundaries":[],"comparison_response_id":null,"configured_mode":"implicit","configured_ttl":null,"diagnostics":null,"status":"applied"},"compatibility":{"effort":"medium","model":"fixture-model","profile":null,"provider":"chatgpt","role":"","status":"experimental"},"configured_effort":"medium","configured_model":"fixture-model","conversation_id":"<v>","effective_effort":null,"effective_model":null,"effective_reasoning_context":null,"effective_service_tier":null,"end_reason":"complete","error":null,"fingerprints":{"contract":{"bytes":12,"sha256":"73921e2b031698b8c0eab172d70ea1552350e568dd019f0fe99871a8549d06c6"},"policy":{"bytes":480,"sha256":"d74b2fb9b49089c8f47b5c7257258c0a63c7442a36b5e5125b2d7c6fa99fcf1c"},"prefix":{"bytes":1541,"sha256":"2e2c70794e172cb6f32327831118393dc5d23c8417cef13d7bbc077575b354e1"},"schema":{"bytes":275,"sha256":"c213ddb4571a6394036326a57be7f1fab27580c6d014de59388f3108033c3172"},"tools":{"bytes":1041,"sha256":"cc803755a8093ca8edd5c72fb4d50e7bccd11dc55288ecd9c6e1fd76c41feb45"}},"first_byte_ms":"<v>","gap_hist":"<v>","headers_ms":"<v>","last_byte_ms":"<v>","last_progress_ms":"<v>","load_average":"<v>","max_gap_ms":"<v>","operation_id":"<v>","outcome":"completed","provider":"chatgpt","provider_request_id":null,"provider_response_id":"resp-3","request_offset_ms":"<v>","requested_reasoning_context":null,"requested_service_tier":null,"stream_bytes":382,"timestamp":"<v>","ttft_ms":"<v>","usage":{"cached":0,"input":3,"output":3,"reasoning":0,"write":null,"write_12h":null,"write_30m":null},"usage_state":"partial","wall_ms":"<v>"},"seq":13,"time":"<v>","type":"request.attempt"}
      {"n":3,"protocol":"kogen-loop/v1","response_id":"resp-3","seq":14,"time":"<v>","type":"response","usage":{"input":3,"cached":0,"output":3,"reasoning":0,"state":"complete","source":"provider"}}
      {"arguments_sha256":"2a70c38c66df66dda77ac0e3bee08ed75285929899c04c70e706f31d78b7719f","call_id":"end","name":"finish","protocol":"kogen-loop/v1","seq":15,"time":"<v>","type":"tool.call"}
      {"claim":"{\"summary\":\"done\"}","ending":"terminal","protocol":"kogen-loop/v1","requests":3,"seq":16,"terminal_tool":"finish","time":"<v>","type":"round.ended","usage":{"input":9,"cached":0,"output":9,"reasoning":0,"state":"complete","source":"provider"}}
      {"exit":0,"protocol":"kogen-loop/v1","seq":17,"status":"ended","time":"<v>","type":"session.ended"}
      """
    And l-startup-hooks-per-run: the request bodies, with the session id as <session>, are:
      | request | bytes | sha256 |
      | 1 | 1778 | 97756d817be453316f027017627763074c40656c905e8ad0ee22fd2755db7fb7 |
      | 2 | 1968 | 7a01ee1f5aa2c11456075f4296cc0f66a91a6c87829841641653e05532148e2b |
      | 3 | 2166 | 4f7ec966bffa4d93b58d29402a13b12e1db1a3037ad5311cbf4d6c6878880e78 |
