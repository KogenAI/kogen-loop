Feature: A read of a file with invalid UTF-8 bytes never reaches the cut-offset arithmetic
  The review finding (a cut numbered read of a file with invalid bytes panics or reports wrong
  omitted_lines) does not reproduce on main. read_file answers any file with invalid UTF-8 with
  a one-line binary notice instead of numbered text, and refuses arguments that are not valid
  UTF-8. So the read is never cut, carries no omitted_lines, and the session ends normally. The
  fixture bad.txt has 600 lines "row <i> " FF FE " " plus 30 "x" (25092 bytes); a valid file of
  that size would be a cut numbered read.

  Scenario: A whole-file read of an invalid UTF-8 file is the uncut binary notice
    When fix-l-cut-recovery-observability: the scripted session reads the invalid UTF-8 fixture with the arguments:
      """
      {"path":"bad.txt"}
      """
    Then fix-l-cut-recovery-observability: the session ends with the finish call and exit code 0
    And fix-l-cut-recovery-observability: the read output delivered to the model is:
      """
      bad.txt: binary file, 25092 bytes (contains a NUL byte or is not valid UTF-8); content not shown
      """
    And fix-l-cut-recovery-observability: the read's tool.result event has cut false and adds exactly:
      """
      {}
      """

  Scenario: A line-range read of an invalid UTF-8 file is the same uncut binary notice
    When fix-l-cut-recovery-observability: the scripted session reads the invalid UTF-8 fixture with the arguments:
      """
      {"path":"bad.txt","start_line":1,"end_line":2000}
      """
    Then fix-l-cut-recovery-observability: the session ends with the finish call and exit code 0
    And fix-l-cut-recovery-observability: the read output delivered to the model is:
      """
      bad.txt: binary file, 25092 bytes (contains a NUL byte or is not valid UTF-8); content not shown
      """
    And fix-l-cut-recovery-observability: the read's tool.result event has cut false and adds exactly:
      """
      {}
      """

  Scenario: A path argument that cannot be valid UTF-8 is refused before any read
    When fix-l-cut-recovery-observability: the scripted session reads the invalid UTF-8 fixture with the arguments:
      """
      {"path":"bad\udcff.txt"}
      """
    Then fix-l-cut-recovery-observability: the session ends with the finish call and exit code 0
    And fix-l-cut-recovery-observability: the read output delivered to the model is:
      """
      error: argument path must be a string
      """
    And fix-l-cut-recovery-observability: the read's tool.result event has cut false and adds exactly:
      """
      {"malformed_class":"missing_argument"}
      """
