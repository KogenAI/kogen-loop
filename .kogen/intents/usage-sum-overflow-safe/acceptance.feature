Feature: Sum provider usage without wrapping counts

  Scenario: One overflowing category leaves a partial sum
    When usage-sum-overflow-safe: sum these usages
      | input | cached | output | reasoning |
      | max   | 2      | 5      | 1         |
      | 1     | 1      | 6      | 2         |
    Then usage-sum-overflow-safe: the sum is input "nil", cached "3", output "11", reasoning "3", state "partial", source "provider"

  Scenario: The maximum count remains known
    When usage-sum-overflow-safe: sum these usages
      | input | cached | output | reasoning |
      | max-1 | 2      | 5      | 1         |
      | 1     | 1      | 6      | 2         |
    Then usage-sum-overflow-safe: the sum is input "max", cached "3", output "11", reasoning "3", state "complete", source "provider"

  Scenario: The count immediately below the maximum remains known
    When usage-sum-overflow-safe: sum these usages
      | input | cached | output | reasoning |
      | max-2 | 2      | 5      | 1         |
      | 1     | 1      | 6      | 2         |
    Then usage-sum-overflow-safe: the sum is input "max-1", cached "3", output "11", reasoning "3", state "complete", source "provider"

  Scenario: Overflow in all categories leaves an unknown sum
    When usage-sum-overflow-safe: sum these usages
      | input | cached | output | reasoning |
      | max   | max    | max    | max       |
      | 1     | 1      | 1      | 1         |
    Then usage-sum-overflow-safe: the sum is input "nil", cached "nil", output "nil", reasoning "nil", state "unknown", source "provider"

  Scenario: Ordinary complete usage sums stay complete
    When usage-sum-overflow-safe: sum these usages
      | input | cached | output | reasoning |
      | 10    | 2      | 5      | 1         |
      | 10    | 2      | 5      | 1         |
    Then usage-sum-overflow-safe: the sum is input "20", cached "4", output "10", reasoning "2", state "complete", source "provider"

  Scenario: Missing categories stay missing in an ordinary partial sum
    When usage-sum-overflow-safe: sum these usages
      | input | cached | output | reasoning |
      | 10    | 2      | 5      | 1         |
      | 10    | nil    | 5      | nil       |
    Then usage-sum-overflow-safe: the sum is input "20", cached "nil", output "10", reasoning "nil", state "partial", source "provider"

  Scenario: Adding an unknown usage still yields unknown
    When usage-sum-overflow-safe: sum these usages
      | input | cached | output | reasoning |
      | 10    | 2      | 5      | 1         |
      | nil   | nil    | nil    | nil       |
    Then usage-sum-overflow-safe: the sum is input "nil", cached "nil", output "nil", reasoning "nil", state "unknown", source "provider"

  Scenario: Summing nothing still yields unknown
    When usage-sum-overflow-safe: sum these usages
      | input | cached | output | reasoning |
    Then usage-sum-overflow-safe: the sum is input "nil", cached "nil", output "nil", reasoning "nil", state "unknown", source "provider"
