Feature: The cut marker names the omitted lines
  A delivered text tool result longer than 16384 bytes is cut around a marker. When the
  cut falls on line boundaries the marker also counts the complete lines omitted, and for
  read_file (numbered) text it names the omitted line range to request.

  Scenario: Plain lines name the omitted bytes and lines
    When I cut the "plain lines" text of 40000 bytes
    Then the delivered text is the first 51 lines, the marker "[... 296 lines, 23680 bytes omitted ...]" and the last 153 lines
    And the delivered text has a "lines" marker that accounts for it exactly
    And the kept and omitted lines add up to 500 lines

  Scenario: A read_file result names the omitted line range
    When the engine delivers the read_file result of a file with 1200 lines
    Then the delivered text is the first 116 lines, the marker "[... 765 lines (117-881), 28305 bytes omitted ...]" and the last 319 lines
    And the delivered text has a "range" marker that accounts for it exactly
    And the head ends at the line before the omitted range and the tail starts at the line after it
    And the kept and omitted lines add up to 1200 lines

  Scenario: A single long line keeps the byte-only marker
    When I cut the "single line" text of 30000 bytes
    Then the delivered text is the first 4096 bytes, the marker "[... 13647 bytes omitted ...]" and the last 12257 bytes
    And the delivered text has a "bytes" marker that accounts for it exactly

  Scenario: A cut inside one long line keeps the byte-only marker
    When I cut the "status line and one long line" text of 30000 bytes
    Then the delivered text is the first 15 bytes, the marker "[... 17728 bytes omitted ...]" and the last 12257 bytes
    And the delivered text has a "bytes" marker that accounts for it exactly

  Scenario Outline: The marker width stays within the bound
    When I cut the "<shape>" text of <size> bytes
    Then the delivered text has a "<kind>" marker that accounts for it exactly

    Examples:
      | shape          | size    | kind  |
      | plain lines    | 16385   | lines |
      | plain lines    | 16400   | lines |
      | plain lines    | 99999   | lines |
      | plain lines    | 1000000 | lines |
      | numbered lines | 16385   | range |
      | numbered lines | 16400   | range |
      | numbered lines | 99999   | range |
      | numbered lines | 1000000 | range |
      | single line    | 16385   | bytes |
      | single line    | 16400   | bytes |
      | single line    | 99999   | bytes |
      | single line    | 1000000 | bytes |

  Scenario Outline: Text that fits is delivered unchanged
    When I cut the "<shape>" text of <size> bytes
    Then the delivered text is unchanged

    Examples:
      | shape          | size  |
      | plain lines    | 16384 |
      | numbered lines | 16384 |
      | single line    | 16383 |

  Scenario Outline: Cutting an already cut text changes nothing
    When I cut the "<shape>" text of 40000 bytes
    Then cutting the delivered text again changes nothing

    Examples:
      | shape          |
      | plain lines    |
      | numbered lines |
      | single line    |

  Scenario Outline: The shell envelope near the bound stays valid JSON
    When a shell command prints the "escaping lines" text of <size> bytes and its handle retrieves it
    Then both shell envelopes are valid JSON of at most 16384 bytes
    And the completed output has a "lines" marker that accounts for the printed text

    Examples:
      | size  |
      | 16000 |
      | 16385 |
      | 40000 |
