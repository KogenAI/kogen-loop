Feature: search_text matches one RE2 pattern dialect on every host
  search_text reads its pattern as RE2 syntax (Go's regexp package) in the tool itself, so a
  pattern gives the same answer on every host. A pattern RE2 cannot express is an error line,
  never "(no matches)". Patterns and expected results are JSON strings, so every backslash
  and tab is explicit.

  Background:
    Given a fresh Git repository for the search dialect
    And the search repository has a file "a.txt" whose JSON-encoded content is:
      """
      "func main() {}\nx = 42 tab\there\nfoo_bar\n"
      """

  Scenario: A word boundary matches whole words only
    When search_text is called with the JSON arguments:
      """
      {"pattern": "\\bfunc\\b"}
      """
    Then the search result is exactly the JSON string:
      """
      "a.txt:1:func main() {}"
      """
    When search_text is called with the JSON arguments:
      """
      {"pattern": "\\bain\\b"}
      """
    Then the search result is exactly the JSON string:
      """
      "(no matches)"
      """

  Scenario: Digit, space and word-character escapes match
    When search_text is called with the JSON arguments:
      """
      {"pattern": "\\d+"}
      """
    Then the search result is exactly the JSON string:
      """
      "a.txt:2:x = 42 tab\there"
      """
    When search_text is called with the JSON arguments:
      """
      {"pattern": "\\s"}
      """
    Then the search result is exactly the JSON string:
      """
      "a.txt:1:func main() {}\na.txt:2:x = 42 tab\there"
      """
    When search_text is called with the JSON arguments:
      """
      {"pattern": "tab\\shere"}
      """
    Then the search result is exactly the JSON string:
      """
      "a.txt:2:x = 42 tab\there"
      """
    When search_text is called with the JSON arguments:
      """
      {"pattern": "\\w+_"}
      """
    Then the search result is exactly the JSON string:
      """
      "a.txt:3:foo_bar"
      """

  Scenario: Alternation keeps working, also with the escapes
    When search_text is called with the JSON arguments:
      """
      {"pattern": "foo|func"}
      """
    Then the search result is exactly the JSON string:
      """
      "a.txt:1:func main() {}\na.txt:3:foo_bar"
      """
    When search_text is called with the JSON arguments:
      """
      {"pattern": "\\d+|_bar"}
      """
    Then the search result is exactly the JSON string:
      """
      "a.txt:2:x = 42 tab\there\na.txt:3:foo_bar"
      """

  Scenario: A pattern the dialect cannot express is an error, not "(no matches)"
    When search_text is called with the JSON arguments:
      """
      {"pattern": "(o)\\1"}
      """
    Then the search result is exactly the JSON string:
      """
      "error: invalid pattern: invalid escape sequence: `\\1`"
      """
    When search_text is called with the JSON arguments:
      """
      {"pattern": "\\Z"}
      """
    Then the search result is exactly the JSON string:
      """
      "error: invalid pattern: invalid escape sequence: `\\Z`"
      """
    When search_text is called with the JSON arguments:
      """
      {"pattern": "main(?=\\()"}
      """
    Then the search result is exactly the JSON string:
      """
      "error: invalid pattern: invalid or unsupported Perl syntax: `(?=`"
      """

  Scenario: An absent pattern still has no matches and an unbalanced parenthesis is an error
    When search_text is called with the JSON arguments:
      """
      {"pattern": "zzz-absent"}
      """
    Then the search result is exactly the JSON string:
      """
      "(no matches)"
      """
    When search_text is called with the JSON arguments:
      """
      {"pattern": "("}
      """
    Then the search result is exactly the JSON string:
      """
      "error: invalid pattern: missing closing ): `(`"
      """

  Scenario: The searched files stay Git's tracked and untracked text files that are not ignored
    Given the search repository has a file ".gitignore" whose JSON-encoded content is:
      """
      "ignored.txt\n"
      """
    And the search repository has a file "ignored.txt" whose JSON-encoded content is:
      """
      "7 ignored\n"
      """
    And the search repository has a file "bin.dat" whose JSON-encoded content is:
      """
      "8\u0000binary\n"
      """
    And the search repository commits all its files
    And the search repository has a file "sub/u.txt" whose JSON-encoded content is:
      """
      "9 untracked\n"
      """
    When search_text is called with the JSON arguments:
      """
      {"pattern": "\\d+"}
      """
    Then the search result is exactly the JSON string:
      """
      "a.txt:2:x = 42 tab\there\nsub/u.txt:1:9 untracked"
      """
    When search_text is called with the JSON arguments:
      """
      {"pattern": "\\d", "path": "sub"}
      """
    Then the search result is exactly the JSON string:
      """
      "sub/u.txt:1:9 untracked"
      """

  Scenario: The tool description states the dialect in one sentence
    Then the search_text description contains the JSON string:
      """
      "Patterns use RE2 syntax (Go's regexp package) on every host and match within one line: \\b, \\d, \\s, \\w, alternation and classes work, and a pattern RE2 cannot express, such as a backreference or lookaround, returns an error instead of no matches."
      """
    And the search_text description does not contain "git grep"
