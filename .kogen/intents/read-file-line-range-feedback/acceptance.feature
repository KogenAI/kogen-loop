Feature: read_file says when a requested line range returned nothing or was not understood
  A read_file call goes through tools.Tools.CallClassified with the model's raw JSON
  arguments on a root holding a.txt ("one\ntwo\nthree\n") and an empty e.txt.

  Background:
    Given the read_file line-range files: a.txt holding one, two, three and an empty e.txt

  Scenario: A start past the end states the file's line count
    When read_file is called with the arguments '{"path":"a.txt","start_line":99}'
    Then the read_file text is "(start_line 99 is past the end of a.txt; line count: 3)"
    And the read_file call carries no error class

  Scenario: An empty file without a range still reads as the empty result
    When read_file is called with the arguments '{"path":"e.txt"}'
    Then the read_file text is empty
    And the read_file call carries no error class

  Scenario: A start_line given as a string is named instead of reading the whole file
    When read_file is called with the arguments '{"path":"a.txt","start_line":"2"}'
    Then the read_file text is "error: argument start_line must be an integer"
    And the read_file call is malformed with class "wrong_argument_type"

  Scenario: An end_line given as a decimal is named instead of reading the whole file
    When read_file is called with the arguments '{"path":"a.txt","end_line":2.5}'
    Then the read_file text is "error: argument end_line must be an integer"
    And the read_file call is malformed with class "wrong_argument_type"

  Scenario: An end before the start is reported
    When read_file is called with the arguments '{"path":"a.txt","start_line":3,"end_line":1}'
    Then the read_file text is "error: end_line 1 is before start_line 3"
    And the read_file call is malformed with class "conflicting_arguments"

  Scenario: An unrepresentable start_line names start_line, not path
    When read_file is called with the arguments '{"path":"a.txt","start_line":1e999}'
    Then the read_file text is "error: argument start_line is a number too large to represent"
    And the read_file call is malformed with class "wrong_argument_type"

  Scenario: A start_line alone still returns the lines from it to the end
    When read_file is called with the arguments '{"path":"a.txt","start_line":2}'
    Then the read_file text is "2\ttwo\n3\tthree"
    And the read_file call carries no error class

  Scenario: An end_line alone still returns the lines up to it
    When read_file is called with the arguments '{"path":"a.txt","end_line":2}'
    Then the read_file text is "1\tone\n2\ttwo"
    And the read_file call carries no error class

  Scenario: A start_line and end_line still return exactly that range
    When read_file is called with the arguments '{"path":"a.txt","start_line":2,"end_line":3}'
    Then the read_file text is "2\ttwo\n3\tthree"
    And the read_file call carries no error class
