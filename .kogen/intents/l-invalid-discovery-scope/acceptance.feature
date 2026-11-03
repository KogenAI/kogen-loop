Feature: Reject invalid discovery scopes without ending calls
  Scenario Outline: Invalid supplied path is repairable
    When l-invalid-discovery-scope: I call "<tool>" with raw arguments '<raw>'
    Then l-invalid-discovery-scope: the first result is "path" and correction returns "unused"
    Examples:
      | tool        | raw                              |
      | list_files  | {"path":5}                       |
      | list_files  | {"path":null}                    |
      | list_files  | {"path":[]}                      |
      | list_files  | {"path":{}}                      |
      | search_text | {"pattern":"needle","path":5}    |
      | search_text | {"pattern":"needle","path":null} |
      | search_text | {"pattern":"needle","path":[]}   |
      | search_text | {"pattern":"needle","path":{}}   |

  Scenario Outline: Malformed listing payload is repairable
    When l-invalid-discovery-scope: I call "list_files" with raw arguments '<raw>'
    Then l-invalid-discovery-scope: the first result is "arguments" and correction returns "unused"
    Examples:
      | raw      |
      | not json |
      | []       |
      | null     |

  Scenario Outline: Valid scopes retain exact discovery results
    When l-invalid-discovery-scope: I call "<tool>" with raw arguments '<raw>'
    Then l-invalid-discovery-scope: the first result is "valid" and correction returns "<text>"
    Examples:
      | tool        | raw                                 | text                                      |
      | list_files  | {}                                  | left/one.txt;right/two.txt                 |
      | list_files  | {"path":""}                         | left/one.txt;right/two.txt                 |
      | list_files  | {"path":"."}                        | left/one.txt;right/two.txt                 |
      | list_files  | {"path":"right"}                    | right/two.txt                             |
      | search_text | {"pattern":"needle"}                | left/one.txt:1:needle;right/two.txt:1:needle |
      | search_text | {"pattern":"needle","path":""}      | left/one.txt:1:needle;right/two.txt:1:needle |
      | search_text | {"pattern":"needle","path":"."}     | left/one.txt:1:needle;right/two.txt:1:needle |
      | search_text | {"pattern":"needle","path":"right"} | right/two.txt:1:needle                     |
