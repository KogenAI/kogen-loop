Feature: read_file states that a binary file is binary instead of numbering its bytes
  A read_file call goes through tools.Tools.CallClassified with the call's JSON arguments
  and its result is cut by Output.Cut, as the loop delivers it. A file whose content has a
  NUL byte or is not valid UTF-8 gets one plain non-error notice with its size in bytes;
  every other file is numbered exactly as before.

  Scenario Outline: a binary file is named as binary with its byte count
    Given a read_file fixture "<file>" with the hex bytes "<bytes>"
    When the model calls "read_file" with the arguments '{"path":"<file>"}'
    Then the tool result is a non-error text result
    And the tool result text is exactly "<file>: binary file, <size> bytes (contains a NUL byte or is not valid UTF-8); content not shown"
    And the tool result text contains no NUL byte and no replacement character

    Examples:
      | file       | bytes        | size |
      | blob.bin   | 610062fffe63 | 6    |
      | nul.bin    | 610062       | 3    |
      | latin1.txt | 636166e90a   | 5    |

  Scenario: 40000 zero bytes give the short notice, not a cut 16 KiB blob
    Given a read_file fixture "zeros.bin" of 40000 zero bytes
    When the model calls "read_file" with the arguments '{"path":"zeros.bin"}'
    Then the tool result is a non-error text result
    And the tool result text is exactly "zeros.bin: binary file, 40000 bytes (contains a NUL byte or is not valid UTF-8); content not shown"

  Scenario: a NUL byte after 20000 bytes of text still makes the file binary
    Given a read_file fixture "late.bin" of 10000 lines "x" followed by the hex bytes "00"
    When the model calls "read_file" with the arguments '{"path":"late.bin"}'
    Then the tool result is a non-error text result
    And the tool result text is exactly "late.bin: binary file, 20001 bytes (contains a NUL byte or is not valid UTF-8); content not shown"

  Scenario: start_line and end_line on a binary file still give the binary notice
    Given a read_file fixture "blob.bin" with the hex bytes "610062fffe63"
    When the model calls "read_file" with the arguments '{"path":"blob.bin","start_line":1,"end_line":1}'
    Then the tool result is a non-error text result
    And the tool result text is exactly "blob.bin: binary file, 6 bytes (contains a NUL byte or is not valid UTF-8); content not shown"

  Scenario: a CRLF text file without a final newline is numbered as today
    Given a read_file fixture "crlf.txt" containing the JSON string:
      """
      "one\r\ntwo\r\nthree"
      """
    When the model calls "read_file" with the arguments '{"path":"crlf.txt"}'
    Then the tool result is a non-error text result
    And the tool result text is exactly the JSON string:
      """
      "1\tone\r\n2\ttwo\r\n3\tthree"
      """

  Scenario: a valid multi-byte UTF-8 file is numbered as today
    Given a read_file fixture "utf8.txt" containing the JSON string:
      """
      "café naïve\n日本語のテキスト\n漢字 🙂\n"
      """
    When the model calls "read_file" with the arguments '{"path":"utf8.txt"}'
    Then the tool result is a non-error text result
    And the tool result text is exactly the JSON string:
      """
      "1\tcafé naïve\n2\t日本語のテキスト\n3\t漢字 🙂"
      """

  Scenario: an empty file is unchanged
    Given a read_file fixture "empty.txt" with the hex bytes ""
    When the model calls "read_file" with the arguments '{"path":"empty.txt"}'
    Then the tool result is a non-error text result
    And the tool result text is exactly the JSON string:
      """
      ""
      """

  Scenario: start_line and end_line on a text file behave as today
    Given a read_file fixture "four.txt" containing the JSON string:
      """
      "one\ntwo\nthree\nfour\n"
      """
    When the model calls "read_file" with the arguments '{"path":"four.txt","start_line":2,"end_line":3}'
    Then the tool result is a non-error text result
    And the tool result text is exactly the JSON string:
      """
      "2\ttwo\n3\tthree"
      """
    When the model calls "read_file" with the arguments '{"path":"four.txt","start_line":3}'
    Then the tool result is a non-error text result
    And the tool result text is exactly the JSON string:
      """
      "3\tthree\n4\tfour"
      """
    When the model calls "read_file" with the arguments '{"path":"four.txt","end_line":1}'
    Then the tool result is a non-error text result
    And the tool result text is exactly the JSON string:
      """
      "1\tone"
      """

  Scenario: a long text file is still cut to the 16 KiB bound
    Given a read_file fixture "long.txt" of 2000 lines "0123456789" followed by the hex bytes ""
    When the model calls "read_file" with the arguments '{"path":"long.txt"}'
    Then the tool result is a non-error text result
    And the tool result text is at most 16384 bytes
    And the tool result text starts with 200 lines numbered from 1 of "0123456789"
    And the tool result text contains " bytes omitted ...]"
    And the tool result text ends with line 2000 of "0123456789"

  Scenario: a PNG keeps its view_image path while read_file names it binary
    Given a read_file fixture "pixel.png" that is a 1x1 RGB8 PNG
    When the model calls "view_image" with the arguments '{"path":"pixel.png"}'
    Then the tool result is typed parts "input_text,input_image"
    When the model calls "read_file" with the arguments '{"path":"pixel.png"}'
    Then the tool result is a non-error text result
    And the tool result text is exactly "pixel.png: binary file, 72 bytes (contains a NUL byte or is not valid UTF-8); content not shown"
