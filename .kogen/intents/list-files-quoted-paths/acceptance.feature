Feature: list_files and search_text print real file names, not Git's octal-quoted form

  Background:
    Given a fresh Git repository for path printing
    And the repository has a file "café.txt" containing "needle"
    And the repository has a file "a b.txt" containing "needle"

  Scenario: list_files prints a non-ASCII name and a name with a space as named
    When the model calls "list_files" with no arguments
    Then the tool result is exactly:
      """
      a b.txt
      café.txt
      """

  Scenario: search_text prints the real path before the line number
    When the model calls "search_text" with arguments:
      """
      {"pattern": "needle"}
      """
    Then the tool result is exactly:
      """
      a b.txt:1:needle
      café.txt:1:needle
      """

  Scenario: a printed non-ASCII path is accepted unchanged by read_file
    When the model calls "list_files" with no arguments
    And the model calls read_file with line 2 of the list_files result as the path
    Then the read_file result is line 1 holding "needle"

  Scenario: a name with a newline made by the shell tool is listed in the quoted form, one line per file
    When the model calls "shell" with arguments:
      """
      {"command": "printf 'needle\\n' > \"$(printf 'line\\nbreak.txt')\""}
      """
    And the model calls "list_files" with no arguments
    Then the tool result is exactly:
      """
      a b.txt
      café.txt
      "line\nbreak.txt"
      """
    When the model calls "search_text" with arguments:
      """
      {"pattern": "needle"}
      """
    Then the tool result is exactly:
      """
      a b.txt:1:needle
      café.txt:1:needle
      "line\nbreak.txt":1:needle
      """
    When the model calls "list_files" with no arguments
    And the model calls read_file with the decoded line 3 of the list_files result as the path
    Then the read_file result is line 1 holding "needle"

  Scenario: a name with a tab is printed as a Go-quoted literal that keeps non-ASCII characters
    Given the repository has a file containing "needle" whose JSON-encoded name is:
      """
      "é/tab\there.txt"
      """
    When the model calls "list_files" with arguments:
      """
      {"path": "é"}
      """
    Then the tool result is exactly:
      """
      "é/tab\there.txt"
      """
    When the model calls "search_text" with arguments:
      """
      {"pattern": "needle", "path": "é"}
      """
    Then the tool result is exactly:
      """
      "é/tab\there.txt":1:needle
      """

  Scenario: a name with another control byte is printed as a Go-quoted literal
    Given the repository has a file containing "needle" whose JSON-encoded name is:
      """
      "q/start\u0001.txt"
      """
    When the model calls "list_files" with arguments:
      """
      {"path": "q"}
      """
    Then the tool result is exactly:
      """
      "q/start\x01.txt"
      """
    When the model calls "search_text" with arguments:
      """
      {"pattern": "needle", "path": "q"}
      """
    Then the tool result is exactly:
      """
      "q/start\x01.txt":1:needle
      """

  Scenario: a name with a non-printable Unicode character is printed as a Go-quoted literal
    Given the repository has a file containing "needle" whose JSON-encoded name is:
      """
      "q/soft­hyphen.txt"
      """
    When the model calls "list_files" with arguments:
      """
      {"path": "q"}
      """
    Then the tool result is exactly, with "<BS>" standing for one backslash:
      """
      "q/soft<BS>u00adhyphen.txt"
      """

  Scenario: a name that starts with a double quote is quoted, and a backslash elsewhere is printed as named
    Given the repository has a file containing "needle" whose JSON-encoded name is:
      """
      "\"quoted.txt"
      """
    And the repository has a file containing "needle" whose JSON-encoded name is:
      """
      "back\\slash.txt"
      """
    When the model calls "list_files" with no arguments
    Then the tool result is exactly:
      """
      "\"quoted.txt"
      a b.txt
      back\slash.txt
      café.txt
      """
    When the model calls "search_text" with arguments:
      """
      {"pattern": "needle"}
      """
    Then the tool result is exactly:
      """
      "\"quoted.txt":1:needle
      a b.txt:1:needle
      back\slash.txt:1:needle
      café.txt:1:needle
      """
    When the model calls read_file with line 3 of the list_files result as the path
    Then the read_file result is line 1 holding "needle"

  Scenario: tracked, untracked and ignored files keep their inclusion rules
    Given the repository has a file ".gitignore" containing "*.log"
    And the repository has a file "tracked-é.txt" containing "needle"
    And the repository commits all its files
    And the repository has a file "untracked-é.txt" containing "needle"
    And the repository has a file "ignored-é.log" containing "needle"
    When the model calls "list_files" with no arguments
    Then the tool result lines, sorted, are exactly:
      """
      .gitignore
      a b.txt
      café.txt
      tracked-é.txt
      untracked-é.txt
      """
    When the model calls "search_text" with arguments:
      """
      {"pattern": "needle"}
      """
    Then the tool result lines, sorted, are exactly:
      """
      a b.txt:1:needle
      café.txt:1:needle
      tracked-é.txt:1:needle
      untracked-é.txt:1:needle
      """
    When the model calls "list_files" with arguments:
      """
      {"path": "nothing-here"}
      """
    Then the tool result is exactly:
      """
      (no files)
      """
    When the model calls "search_text" with arguments:
      """
      {"pattern": "absent"}
      """
    Then the tool result is exactly:
      """
      (no matches)
      """

  Scenario: the quoted form is documented in both tool definitions
    Then the "list_files" tool description contains:
      """
      Each path is printed as named, except that a name holding a control or other non-printable character or invalid UTF-8, or starting with ", is printed as a Go double-quoted string literal (for example "a\nb.txt"): decode it to get the path.
      """
    And the "search_text" tool description contains:
      """
      Each path is printed as named, except that a name holding a control or other non-printable character or invalid UTF-8, or starting with ", is printed as a Go double-quoted string literal (for example "a\nb.txt"): decode it to get the path.
      """
