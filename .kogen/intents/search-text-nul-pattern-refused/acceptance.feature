Feature: Refuse NUL search patterns without silent truncation
  Background:
    Given a fresh Git repository for the search dialect
    And the search repository has a file "a.txt" whose JSON-encoded content is:
      """
      "alpha only\n"
      """
    And the search repository has a file "b.txt" whose JSON-encoded content is:
      """
      "beta only\n"
      """
    And the search repository commits all its files

  Scenario: Ordinary pattern returns only its matching line
    When search_text is called with the JSON arguments:
      """
      {"pattern":"alpha"}
      """
    Then the search result is exactly the JSON string:
      """
      "a.txt:1:alpha only"
      """

  Scenario: Embedded NUL refuses instead of matching alpha alone
    When search_text is called with the JSON arguments:
      """
      {"pattern":"alpha\u0000beta"}
      """
    Then the search result is exactly the JSON string:
      """
      "error: pattern contains a NUL character"
      """

  Scenario: Leading NUL refuses instead of matching every line
    When search_text is called with the JSON arguments:
      """
      {"pattern":"\u0000beta"}
      """
    Then the search result is exactly the JSON string:
      """
      "error: pattern contains a NUL character"
      """

  Scenario: Invalid expression keeps its existing diagnostic
    When search_text is called with the JSON arguments:
      """
      {"pattern":"("}
      """
    Then the search result is exactly the JSON string:
      """
      "error: invalid pattern: missing closing ): `(`"
      """

  Scenario: Absent pattern keeps the no matches result
    When search_text is called with the JSON arguments:
      """
      {"pattern":"absent"}
      """
    Then the search result is exactly the JSON string:
      """
      "(no matches)"
      """
