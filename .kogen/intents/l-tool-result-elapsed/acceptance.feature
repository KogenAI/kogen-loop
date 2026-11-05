Feature: Each tool.result records its call's own execution time
  Every tool.result event gains "elapsed_ms", an integer: the wall time in whole milliseconds
  from the moment the session starts running the call to the moment its output is complete,
  measured with the tools' clock seam (tools.Tools.Now) that the shell-wait record also reads.
  Shell calls keep shell_wait. Terminal calls have no tool.result. Nothing the model receives
  and no other event field changes, and no path, argument or file text reaches the events.

  Scenario: CLI - every tool.result of a CLI run carries its own elapsed_ms beside its unchanged fields
    When l-tool-result-elapsed: I run the scripted CLI session
    Then l-tool-result-elapsed: the session ends with the finish call and no error
    And l-tool-result-elapsed: the outputs delivered to the model are:
      """
      {"short":"exit status: 0\n","long":"exit status: 0\n","read":"1\tl-tre-needle line","write":"ok","list":"l-tre-notes.txt\nl-tre-written.txt","search":"l-tre-notes.txt:1:l-tre-needle line","image":"error: l-tre-missing.png: unreadable/nonregular artifact or invalid PNG: cannot stat artifact: enoent. Limits: static non-interlaced RGB8 PNG, 1..131072 bytes, dimensions 1..2048. Prepare/export a supported image with an ordinary external image preparation/capture tool and select it again.","docs":"{\"body\":\"\",\"error\":\"documentation source unsupported\",\"operation\":\"l-tre-unsupported\",\"query\":\"\",\"sources\":[],\"status\":\"unsupported\",\"truncated\":false,\"untrusted\":false,\"url\":\"\"}","refused":"refused: this command would stop processes this run did not start (rule: no pkill or killall; kill only pids this run created). Stop what you started with its own pid, for example kill $!, or its process group.","malformed":"error: supply exactly one of command or handle","unknown":"error: unknown tool l_tre_no_such_tool"}
      """
    And l-tool-result-elapsed: each tool.result describes the output the model received
    And l-tool-result-elapsed: the tool events add exactly, with each non-negative integer elapsed_ms as "ms" and each shell_wait instant as "instant":
      """
      {"callEvents":{"short":{},"long":{},"read":{},"write":{},"list":{},"search":{},"image":{},"docs":{},"refused":{},"malformed":{},"unknown":{},"end":{}},"results":{"short":{"elapsed_ms":"ms","exit_status":0,"shell_wait":{"spawned":"instant","wait_started":"instant","wait_ended":"instant","ended_by":"exit"}},"long":{"elapsed_ms":"ms","exit_status":0,"shell_wait":{"spawned":"instant","wait_started":"instant","wait_ended":"instant","ended_by":"exit"}},"read":{"elapsed_ms":"ms"},"write":{"elapsed_ms":"ms"},"list":{"elapsed_ms":"ms"},"search":{"elapsed_ms":"ms"},"image":{"elapsed_ms":"ms","error_kind":"invalid_image"},"docs":{"elapsed_ms":"ms"},"refused":{"elapsed_ms":"ms","rule":"pkill-killall","error_kind":"foreign_kill","shell_wait":{"spawned":null,"wait_started":"instant","wait_ended":"instant","ended_by":"exit"}},"malformed":{"elapsed_ms":"ms","malformed_class":"missing_argument"},"unknown":{"elapsed_ms":"ms","malformed_class":"unknown_tool"}}}
      """
    And l-tool-result-elapsed: the elapsed_ms of each call lies in its range:
      | call      | from | below |
      | short     | 200  | 30000 |
      | long      | 1200 | 30000 |
      | read      | 0    | 5000  |
      | write     | 0    | 5000  |
      | list      | 0    | 5000  |
      | search    | 0    | 5000  |
      | image     | 0    | 5000  |
      | docs      | 0    | 5000  |
      | refused   | 0    | 5000  |
      | malformed | 0    | 5000  |
      | unknown   | 0    | 5000  |
    And l-tool-result-elapsed: each elapsed_ms fits within the seconds of its tool.call and tool.result events and covers its shell wait
    And l-tool-result-elapsed: every event time is a whole RFC 3339 second of the real run
    And l-tool-result-elapsed: the other events carry exactly these fields:
      """
      {"session.started":["capabilities_digest","resumed","role","session_id"],"request.started":["effort","model","n","owner"],"request.attempt":["n","record"],"response":["n","response_id","usage"],"round.ended":["claim","ending","requests","terminal_tool","usage"],"session.ended":["exit","status"]}
      """
    And l-tool-result-elapsed: no request body sent to the model mentions elapsed_ms
    And l-tool-result-elapsed: the event stream carries no path, argument or file text

  Scenario: Injected clock - two calls in one response report 200 and 1200 ms, refused and malformed calls 0
    When l-tool-result-elapsed: I run the session harness on an injected clock
    Then l-tool-result-elapsed: the injected clock is set on the session's tools
    And l-tool-result-elapsed: the session ends with the finish call and no error
    And l-tool-result-elapsed: the outputs delivered to the model are:
      """
      {"p200":"probe ran 200 ms","p1200":"probe ran 1200 ms","read":"1\tl-tre-clock-text","refused":"refused: this command would stop processes this run did not start (rule: no pkill or killall; kill only pids this run created). Stop what you started with its own pid, for example kill $!, or its process group.","malformed":"error: supply exactly one of command or handle","unknown":"error: unknown tool l_tre_no_such_tool"}
      """
    And l-tool-result-elapsed: each tool.result describes the output the model received
    And l-tool-result-elapsed: the tool events add exactly:
      """
      {"callEvents":{"p200":{},"p1200":{},"read":{},"refused":{},"malformed":{},"unknown":{},"end":{}},"results":{"p200":{"elapsed_ms":200},"p1200":{"elapsed_ms":1200},"read":{"elapsed_ms":0},"refused":{"elapsed_ms":0,"rule":"pkill-killall","error_kind":"foreign_kill","shell_wait":{"spawned":null,"wait_started":"2026-11-05T10:00:01.400000000Z","wait_ended":"2026-11-05T10:00:01.400000000Z","ended_by":"exit"}},"malformed":{"elapsed_ms":0,"malformed_class":"missing_argument"},"unknown":{"elapsed_ms":0,"malformed_class":"unknown_tool"}}}
      """
    And l-tool-result-elapsed: every event time is a whole RFC 3339 second of the real run
    And l-tool-result-elapsed: the other events carry exactly these fields:
      """
      {"request.started":["effort","model","n","owner"],"request.attempt":["n","record"],"response":["n","response_id","usage"],"round.ended":["claim","ending","requests","terminal_tool","usage"]}
      """
    And l-tool-result-elapsed: no request body sent to the model mentions elapsed_ms
    And l-tool-result-elapsed: the event stream carries no path, argument or file text

  Scenario: Contract - the event table lists elapsed_ms on tool.result with a note
    Then l-tool-result-elapsed: the contract lists elapsed_ms in the tool.result row and in a note that names Tools.Now
