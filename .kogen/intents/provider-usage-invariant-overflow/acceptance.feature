Feature: Classify overflowing provider usage counts as inconsistent
  These fully reported counts are Go ints; max is the target's maximum int.

  Scenario: Cached and write counts overflow together
    When provider-usage-invariant-overflow: classify input "max", cached "max", write "1", 30m "0", 12h "1", output "1", reasoning "0"
    Then provider-usage-invariant-overflow: the usage state is "inconsistent"

  Scenario: Individually in-range write lifetimes overflow together
    When provider-usage-invariant-overflow: classify input "max", cached "0", write "max", 30m "max", 12h "1", output "1", reasoning "0"
    Then provider-usage-invariant-overflow: the usage state is "inconsistent"

  Scenario: Both consistency sums can reach the integer limit
    When provider-usage-invariant-overflow: classify input "max", cached "0", write "max", 30m "max-1", 12h "1", output "1", reasoning "0"
    Then provider-usage-invariant-overflow: the usage state is "known"

  Scenario: Nonzero cached and write counts can sum to the integer limit
    When provider-usage-invariant-overflow: classify input "max", cached "1", write "max-1", 30m "max-2", 12h "1", output "1", reasoning "0"
    Then provider-usage-invariant-overflow: the usage state is "known"

  Scenario: Both consistency sums can be one below the integer limit
    When provider-usage-invariant-overflow: classify input "max-1", cached "0", write "max-1", 30m "max-2", 12h "1", output "1", reasoning "0"
    Then provider-usage-invariant-overflow: the usage state is "known"
