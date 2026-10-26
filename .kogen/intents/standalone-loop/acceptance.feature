Feature: Adopt the independently callable Kogen Loop
  The external candidate is source material, not an approval or receipt.
  Native observations exercise the public library and the built CLI offline.

  Scenario: Adopt source and preserve full truthful provenance
    Given the independent loop input is:
      """json
      {"links":["docs/contract/loop-v1.md","api/","conformance/","LICENSE","NOTICE","docs/provenance/extraction.md","docs/provenance/loop-reference-manifest.json","docs/provenance/reference-README.md"],"provenance":["/Users/almirsarajcic/Areas/Kogen/studio-work/kogen-loop-extraction-20261026/sprint-30min/loop-reference.tar.gz","/Users/almirsarajcic/Areas/Kogen/studio-work/kogen-loop-extraction-20261026/sprint-30min/loop-reference-manifest.json","95520d37e26377bff74794eb9faa5cd67d0228f9b65fcf8e04c7e12f93dbfd40","65dc3a49a5f939ef5d761c2d6980184ae60f0c7dcfc47454f14ec405547fc51d","56eecd572a6e07184863939254a90d9a2dc44e96","Apache-2.0","26 October 2026","main.go","go.mod","README.md"]}
      """
    When I exercise the standalone loop through "adoption"
    Then the independent loop observation includes:
      """json
      {"archive":"95520d37e26377bff74794eb9faa5cd67d0228f9b65fcf8e04c7e12f93dbfd40","manifest":"65dc3a49a5f939ef5d761c2d6980184ae60f0c7dcfc47454f14ec405547fc51d","allSourcePresent":true,"compatibilityBytes":true,"referenceTestsIntact":true,"license":true,"notice":true,"referenceReadme":true,"bootstrapRemoved":true,"module":"module kogen-loop","modules":["kogen-loop"],"noAgents":true,"readmeNavigation":true,"bootstrapProvenance":true,"provenanceComplete":true}
      """

  Scenario: Execute the real race conformance vet and build gates
    Given the independent loop input is:
      """json
      {}
      """
    When I exercise the standalone loop through "checks"
    Then the independent loop observation includes:
      """json
      {"results":[{"command":"go test -race ./...","passed":true,"suites":["conformance","provider","sys","tools"]},{"command":"go test ./conformance -count=1","passed":true,"suites":["conformance"]},{"command":"go vet ./...","passed":true,"suites":[]},{"command":"go build -o /dev/null ./...","passed":true,"suites":[]}]}
      """

  Scenario: Discover honest capabilities without credentials or network
    Given the independent loop input is:
      """json
      {}
      """
    When I exercise the standalone loop through "capabilities"
    Then the independent loop observation includes:
      """json
      {"protocol":"kogen-loop/v1","library":"loop/v1","version":"dev","providers":["chatgpt","supergrok","opencode-go","anthropic","openai-compatible"],"tools":["read_file","write_file","list_files","search_text","shell","view_image","documentation"],"terminal_default":["finish"],"session_resume":"transcript","context_policies":["fail_over_budget"],"usage":"provider","images":true,"subagents":false,"compaction":false}
      """

  Scenario: Call the library repeatedly with interception and last terminal wins
    Given the independent loop input is:
      """json
      {"handle":"host","responses":[[{"type":"function_call","call_id":"host","name":"write_file","arguments":"{\"path\":\"must-not-exist.txt\",\"content\":\"wrong\"}"},{"type":"function_call","call_id":"ordinary","name":"shell","arguments":"{\"command\":\"printf alpha\"}"}],[{"type":"function_call","call_id":"first","name":"finish","arguments":"{\"summary\":\"first\"}"},{"type":"function_call","call_id":"last","name":"finish","arguments":"{\"summary\":\"last\"}"},{"type":"function_call","call_id":"late","name":"shell","arguments":"{\"command\":\"printf beta > after.txt; printf beta\"}"}]]}
      """
    When I exercise the standalone loop through "library"
    Then the independent loop observation includes:
      """json
      {"ending":"terminal","terminal":"last","requests":2,"error":"","host_error":false,"cancelled":false,"file_names":["after.txt"],"files":{"after.txt":"beta"},"trace":["request","before:host","after:host:false","before:ordinary","after:ordinary:false","request","before:first","after:first:true","before:last","after:last:true","before:late","after:late:false"],"seen":[{"Owner":"independent","Instructions":"native acceptance","Tools":[{"name":"sentinel"}],"Input":[{"role":"user","content":"start"}]},{"Input":[{"role":"user","content":"start"},{"type":"function_call","call_id":"host"},{"type":"function_call","call_id":"ordinary"},{"type":"function_call_output","call_id":"host","output":"host output"},{"type":"function_call_output","call_id":"ordinary","output":"exit status: 0\nalpha"}]}],"input":[{"role":"user","content":"start"},{"type":"function_call","call_id":"host"},{"type":"function_call","call_id":"ordinary"},{"type":"function_call_output","call_id":"host","output":"host output"},{"type":"function_call_output","call_id":"ordinary","output":"exit status: 0\nalpha"},{"type":"function_call","call_id":"first"},{"type":"function_call","call_id":"last"},{"type":"function_call","call_id":"late"},{"type":"function_call_output","call_id":"late","output":"exit status: 0\nbeta"}]}
      """

  Scenario: Call the library with a no-call answer
    Given the independent loop input is:
      """json
      {"responses":[[{"type":"message","id":"m","role":"assistant","content":[{"type":"output_text","text":"A claim only."}]}]]}
      """
    When I exercise the standalone loop through "library"
    Then the independent loop observation includes:
      """json
      {"ending":"no_call","terminal":null,"requests":1,"error":"","file_names":[],"trace":["request"],"input":[{"role":"user","content":"start"},{"type":"message","role":"assistant","content":[{"type":"output_text","text":"A claim only."}]}]}
      """

  Scenario: Stop on the exact host error without executing tools
    Given the independent loop input is:
      """json
      {"stop":"blocked","responses":[[{"type":"function_call","call_id":"blocked","name":"write_file","arguments":"{\"path\":\"bad.txt\",\"content\":\"bad\"}"},{"type":"function_call","call_id":"never","name":"finish","arguments":"{}"}]]}
      """
    When I exercise the standalone loop through "library"
    Then the independent loop observation includes:
      """json
      {"error":"host stop","host_error":true,"ending":"","terminal":null,"file_names":[],"trace":["request","before:blocked"],"seen":[{"Input":[{"role":"user","content":"start"}]}]}
      """

  Scenario: Return library cancellation rather than an ending
    Given the independent loop input is:
      """json
      {"cancel":true,"responses":[]}
      """
    When I exercise the standalone loop through "library"
    Then the independent loop observation includes:
      """json
      {"error":"context canceled","cancelled":true,"ending":"","terminal":null,"file_names":[],"trace":["request"]}
      """

  Scenario: Preserve the exact tool-result boundary and stable overflow cut
    Given the independent loop input is:
      """json
      {"responses":[[]],"sizes":[16383,16384,16385]}
      """
    When I exercise the standalone loop through "library"
    Then the independent loop observation includes:
      """json
      {"cuts":[{"size":16383,"bytes":16383,"unchanged":true,"marker":false,"stable":true},{"size":16384,"bytes":16384,"unchanged":true,"marker":false,"stable":true},{"size":16385,"bytes":16381,"unchanged":false,"marker":true,"stable":true}]}
      """

  Scenario: Run a recorded file-based terminal task through the built CLI
    Given the independent loop input is:
      """json
      {"fixture":"terminal"}
      """
    When I exercise the standalone loop through "cli"
    Then the independent loop observation includes:
      """json
      {"exit":0,"requestCount":2,"eventTypes":["session.started","request.started","request.attempt","response","tool.call","tool.result","request.started","request.attempt","response","tool.call","round.ended","session.ended"],"deliveries":[{"call_id":"c1","bounded":true,"marker":false,"hashMatches":true,"bytesMatch":true}],"events":[{"resumed":false},{"n":1},{},{"usage":{"input":10,"cached":2,"output":5,"reasoning":1,"state":"complete","source":"provider"}},{"call_id":"c1","name":"read_file"},{"call_id":"c1","cut":false},{"n":2},{},{"response_id":"resp-2"},{"call_id":"c2","name":"finish"},{"ending":"terminal","terminal_tool":"finish","claim":"{\"summary\":\"read it\"}","requests":2,"usage":{"input":30,"cached":12,"output":11,"reasoning":1,"state":"complete","source":"provider"}},{"status":"ended","exit":0}]}
      """

  Scenario: Treat CLI final text only as a no-call claim
    Given the independent loop input is:
      """json
      {"fixture":"no_call","stdin":true}
      """
    When I exercise the standalone loop through "cli"
    Then the independent loop observation includes:
      """json
      {"exit":0,"requestCount":1,"eventTypes":["session.started","request.started","request.attempt","response","round.ended","session.ended"],"outputs":[],"events":[{"resumed":false},{},{},{"response_id":"resp-1"},{"ending":"no_call","terminal_tool":null,"claim":"All done.","requests":1,"usage":{"input":4,"cached":0,"output":2,"reasoning":0,"state":"complete","source":"provider"}},{"status":"ended","exit":0}]}
      """

  Scenario: Execute both sides of a terminal in the middle of a CLI batch
    Given the independent loop input is:
      """json
      {"fixture":"multi_call_terminal_in_middle"}
      """
    When I exercise the standalone loop through "cli"
    Then the independent loop observation includes:
      """json
      {"exit":0,"requestCount":1,"eventTypes":["session.started","request.started","request.attempt","response","tool.call","tool.result","tool.call","tool.call","tool.result","round.ended","session.ended"],"events":[{},{},{},{},{"call_id":"c1"},{"call_id":"c1","name":"read_file","cut":false},{"call_id":"c2","name":"finish"},{"call_id":"c3"},{"call_id":"c3","name":"read_file","cut":false},{"ending":"terminal","claim":"{\"summary\":\"partial\"}","requests":1},{"status":"ended","exit":0}]}
      """

  Scenario: Deliver the actual bounded output and matching event digest to the next model request
    Given the independent loop input is:
      """json
      {"fixture":"tool_result_cut"}
      """
    When I exercise the standalone loop through "cli"
    Then the independent loop observation includes:
      """json
      {"exit":0,"requestCount":2,"eventTypes":["session.started","request.started","request.attempt","response","tool.call","tool.result","request.started","request.attempt","response","tool.call","round.ended","session.ended"],"deliveries":[{"call_id":"c1","bounded":true,"marker":true,"hashMatches":true,"bytesMatch":true}],"events":[{},{},{},{},{},{"cut":true},{},{},{},{},{"ending":"terminal","requests":2},{"status":"ended","exit":0}]}
      """

  Scenario: Preserve partial usage through a real two-request CLI round
    Given the independent loop input is:
      """json
      {"fixture":"usage_partial"}
      """
    When I exercise the standalone loop through "cli"
    Then the independent loop observation includes:
      """json
      {"exit":0,"requestCount":2,"events":[{},{},{},{"type":"response","usage":{"input":7,"cached":null,"output":3,"reasoning":null,"state":"partial","source":"provider"}},{},{},{},{},{"type":"response","usage":{"input":8,"cached":null,"output":4,"reasoning":null,"state":"partial","source":"provider"}},{},{"type":"round.ended","usage":{"input":15,"cached":null,"output":7,"reasoning":null,"state":"partial","source":"provider"}},{"type":"session.ended","status":"ended"}]}
      """

  Scenario: Never manufacture unknown usage on the CLI boundary
    Given the independent loop input is:
      """json
      {"fixture":"usage_unknown"}
      """
    When I exercise the standalone loop through "cli"
    Then the independent loop observation includes:
      """json
      {"exit":0,"requestCount":1,"events":[{},{},{},{"type":"response","response_id":null,"usage":{"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown","source":"provider"}},{"type":"tool.call"},{"type":"round.ended","usage":{"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown","source":"provider"}},{"type":"session.ended","status":"ended"}]}
      """

  Scenario Outline: Refuse invalid tasks before any provider request
    Given the independent loop input is:
      """json
      <input>
      """
    When I exercise the standalone loop through "cli"
    Then the independent loop observation includes:
      """json
      {"exit":2,"requestCount":0,"eventTypes":["error","session.ended"],"events":[{"class":"loop","reason":"<reason>"},{"status":"failed","exit":2}]}
      """
    Examples:
      | input                                                             | reason                 |
      | {"task":{"success":true}}                                         | invalid_task           |
      | {"task":{"session":{"dir":"","resume":false,"extra":1}}}          | invalid_task           |
      | {"raw":"{} {}","stdin":true}                                      | invalid_task           |
      | {"raw":"not json"}                                                | invalid_task           |
      | {"raw":"{\"protocol\":\"kogen-loop/v1\",\"root\":5}"}              | invalid_task           |
      | {"raw":"","stdin":true}                                           | invalid_task           |
      | {"task":{"prompt":""}}                                            | invalid_task           |
      | {"task":{"deadline_seconds":-1}}                                  | invalid_task           |
      | {"task":{"protocol":"kogen-loop/v2","extra":true}}                | unsupported_protocol   |
      | {"task":{"requires":["subagents"]}}                               | unsupported_capability |
      | {"task":{"requires":["compaction"]}}                              | unsupported_capability |

  Scenario Outline: Interrupt a live shell group without reporting a completed round
    Given the independent loop input is:
      """json
      {"children":true,"signal":"<signal>","exchanges":[{"items":[{"type":"function_call","call_id":"child","name":"shell","arguments":"{\"command\":\"echo $$ > pid-sh; sleep 600 & echo $! > pid-sleep; wait\"}"}]}]}
      """
    When I exercise the standalone loop through "cli"
    Then the independent loop observation includes:
      """json
      {"exit":<exit>,"requestCount":1,"processesGone":[true,true],"eventTypes":["session.started","request.started","request.attempt","response","tool.call","session.ended"],"events":[{},{},{},{},{"call_id":"child","name":"shell"},{"status":"interrupted","exit":<exit>}]}
      """
    Examples:
      | signal  | exit |
      | SIGINT  | 130  |
      | SIGTERM | 143  |

  Scenario: Expire a deadline and terminate both running shell processes
    Given the independent loop input is:
      """json
      {"children":true,"task":{"deadline_seconds":3},"exchanges":[{"items":[{"type":"function_call","call_id":"child","name":"shell","arguments":"{\"command\":\"echo $$ > pid-sh; sleep 600 & echo $! > pid-sleep; wait\"}"}]}]}
      """
    When I exercise the standalone loop through "cli"
    Then the independent loop observation includes:
      """json
      {"exit":1,"requestCount":1,"processesGone":[true,true],"eventTypes":["session.started","request.started","request.attempt","response","tool.call","error","session.ended"],"events":[{},{},{},{},{"call_id":"child","name":"shell"},{"class":"loop","reason":"deadline"},{"status":"failed","exit":1}]}
      """
