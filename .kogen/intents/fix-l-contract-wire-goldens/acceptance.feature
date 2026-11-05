Feature: fix-l-contract-wire-goldens: The wire golden test catches stale keys and names the first differing path
  On main, TestProviderWireGoldens (contract/provider_wire_golden_test.go) stays green when
  contract/testdata/loop_knobs_golden.json holds keys that no route or variant visits, and a
  body mismatch prints both whole bodies with no path to the difference. Each scenario edits
  the golden fixture of a scratch copy of the module (never the working tree) and runs
  go test ./contract -run <filter> -count=1 -v there, or runs it in the working tree.
  "messages" lists, in output order, the text after every "<file>.go:<line>: " prefix.

  Scenario: Stale keys left by a removed route and a removed variant fail the test
    Given fix-l-contract-wire-goldens: a scratch copy of the module
    And fix-l-contract-wire-goldens: the copy's golden gains the case "baseline/retired" with the body of "baseline/chatgpt"
    And fix-l-contract-wire-goldens: the copy's golden gains the case "tools/chatgpt/tools=auto" with the body of "tools/chatgpt/tools=true"
    When fix-l-contract-wire-goldens: the wire golden test runs in the copy with the filter "^TestProviderWireGoldens$"
    Then fix-l-contract-wire-goldens: the run outcome is:
      """
      {"result":"FAIL","passing":18,"failing":[],"messages":[
        "stale golden key baseline/retired is not visited by any route or variant",
        "stale golden key tools/chatgpt/tools=auto is not visited by any route or variant"]}
      """

  Scenario: A nested value mismatch reports its path and both values
    Given fix-l-contract-wire-goldens: a scratch copy of the module
    And fix-l-contract-wire-goldens: the copy's golden case "baseline/anthropic" has "messages.0.content.0.text" set to the JSON '"bye"'
    When fix-l-contract-wire-goldens: the wire golden test runs in the copy with the filter "^TestProviderWireGoldens$"
    Then fix-l-contract-wire-goldens: the run outcome is:
      """
      {"result":"FAIL","passing":17,"failing":["baseline/anthropic"],"messages":[
        "baseline/anthropic body differs at $.messages[0].content[0].text: got \"hi\", want \"bye\""]}
      """

  Scenario: Only the first differing path in member-name order is reported
    Given fix-l-contract-wire-goldens: a scratch copy of the module
    And fix-l-contract-wire-goldens: the copy's golden case "baseline/chatgpt" has "instructions" set to the JSON '"rules"'
    And fix-l-contract-wire-goldens: the copy's golden case "baseline/chatgpt" has "tools.0.name" set to the JSON '"write_file"'
    And fix-l-contract-wire-goldens: the copy's golden case "baseline/chatgpt" has no "include"
    When fix-l-contract-wire-goldens: the wire golden test runs in the copy with the filter "^TestProviderWireGoldens$"
    Then fix-l-contract-wire-goldens: the run outcome is:
      """
      {"result":"FAIL","passing":17,"failing":["baseline/chatgpt"],"messages":[
        "baseline/chatgpt body differs at $.include: got [\"reasoning.encrypted_content\"], want <missing>"]}
      """

  Scenario: An array element or member present on one side only is reported as missing on the other
    Given fix-l-contract-wire-goldens: a scratch copy of the module
    And fix-l-contract-wire-goldens: the copy's golden case "tools/supergrok/tools=true" has no "tools.1"
    And fix-l-contract-wire-goldens: the copy's golden case "tools/anthropic/tools=false" has "metadata" set to the JSON '{"user_id":"x"}'
    When fix-l-contract-wire-goldens: the wire golden test runs in the copy with the filter "^TestProviderWireGoldens$"
    Then fix-l-contract-wire-goldens: the run outcome is:
      """
      {"result":"FAIL","passing":16,"failing":["tools/supergrok/tools=true","tools/anthropic/tools=false"],"messages":[
        "tools/supergrok/tools=true body differs at $.tools[1]: got {\"description\":\"d\",\"name\":\"submit\",\"parameters\":{\"type\":\"object\"},\"type\":\"function\"}, want <missing>",
        "tools/anthropic/tools=false body differs at $.metadata: got <missing>, want {\"user_id\":\"x\"}"]}
      """

  Scenario: The committed golden fixture passes with all 18 cases
    When fix-l-contract-wire-goldens: the wire golden test runs in the working tree with the filter "^TestProviderWireGoldens$"
    Then fix-l-contract-wire-goldens: the run outcome is:
      """
      {"result":"PASS","passing":18,"failing":[],"messages":[]}
      """

  Scenario: A run filtered to one case does not report the other keys as stale
    When fix-l-contract-wire-goldens: the wire golden test runs in the working tree with the filter "^TestProviderWireGoldens$/^baseline$/^chatgpt$"
    Then fix-l-contract-wire-goldens: the run outcome is:
      """
      {"result":"PASS","passing":1,"failing":[],"messages":[]}
      """
