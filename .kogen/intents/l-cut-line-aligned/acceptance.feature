Feature: Line-aligned bounded tool text
  Scenario Outline: Preserve readable ends and bounded UTF-8
    When I cut the line-alignment fixture "<fixture>"
    Then the line-alignment result satisfies the byte and line contract
    Examples:
      | fixture |
      | lines |
      | numbered |
      | single |
      | unicode |
      | 0 |
      | 16383 |
      | 16384 |
      | 16385 |

  Scenario: JSON escaping does not break the shell envelope
    When I run the existing escaped shell envelope regression
    Then the escaped shell envelope regression passes
