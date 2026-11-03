Feature: Protect the actual native write destination
  Scenario Outline: Protected existing destinations
    When I exercise protected write case "<case>"
    Then the protected write snapshot is:
      """
      {"text":"refused: checks/accept.txt is part of the approved acceptance baseline","kind":"protected","content":"keep","exists":true,"links":<links>,"mode":"-rw-r-----"}
      """
    Examples:
      | case      | links                                                                  |
      | direct    | {}                                                                     |
      | link      | {"shortcut.txt":"checks/accept.txt"}                                   |
      | chain     | {"shortcut.txt":"second.txt","second.txt":"checks/accept.txt"}         |
      | directory | {"alias":"checks"}                                                     |

  Scenario: A protected missing destination stays missing
    When I exercise protected write case "dangling"
    Then the protected write snapshot is:
      """
      {"text":"refused: checks/accept.txt is part of the approved acceptance baseline","kind":"protected","content":"","exists":false,"links":{"shortcut.txt":"checks/accept.txt"},"mode":"missing"}
      """

  Scenario: Unprotected links stay writable and intact
    When I exercise protected write case "unprotected"
    Then the protected write snapshot is:
      """
      {"text":"ok","kind":"","content":"replace","exists":true,"links":{"shortcut.txt":"checks/free.txt"},"mode":"-rw-r-----"}
      """

  Scenario: Replacement preserves permissions
    When I exercise protected write case "replace"
    Then the protected write snapshot is:
      """
      {"text":"ok","kind":"","content":"replace","exists":true,"links":{},"mode":"-rw-r-----"}
      """

  Scenario: Ordinary nested creation still works
    When I exercise protected write case "create"
    Then the protected write snapshot is:
      """
      {"text":"ok","kind":"","content":"replace","exists":true,"links":{},"mode":"-rw-r--r--"}
      """

  Scenario: Read-only refusal remains unchanged
    When I exercise protected write case "readonly"
    Then the protected write snapshot is:
      """
      {"text":"error: checks/accept.txt: eacces","kind":"file_error","content":"keep","exists":true,"links":{},"mode":"-r--r--r--"}
      """
