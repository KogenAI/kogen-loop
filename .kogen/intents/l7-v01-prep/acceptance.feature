Feature: Prepare v0.1 without releasing it
  Scenario: Record exactly the requested delivered capabilities
    Then the L7 unreleased changelog entries are exactly
      """
      bbf3fdd Extract the standalone Kogen Loop
      b782019 Verify provider affinity and tool-batch replay
      84c427d Add caller-owned shell duration bounds
      f47ec9f Restore timeout custody liveness
      0665b58 Explain invalid Anthropic stream outcomes
      2ea31bf Retry transient provider stream faults
      3fd0443 Sweep command groups and refuse foreign kills
      9c079e1 Store a token for the external executor
      bd627aa Keep the provider's bounded refusal message
      c803fea Add a round limit and no-progress stop to Run
      c7e8331 Fix two Linux test flakes
      """

  Scenario: State current status with dated provenance
    Then README contains the L7 current status text
      """
      As of 28 October 2026, Kogen adopted the caller-owned shell bound in commit `8793a7f`. Commit `c7e8331` fixed two Linux test flakes; both tests passed 50/50 on eu2.
      """
    And README does not contain the L7 stale current claim "is not adopted by Kogen here"
    And README contains the L7 historical marker "Published and pinned baseline observed on 27 October 2026"
    And README contains the L7 release boundary "No v0.1 tag has been created and nothing is published by this preparation."

  Scenario: Expose the tested development version
    When I inspect the L7 public version
    Then the L7 public documentation contains "Version = \"0.1.0-dev\""
    When I run the L7 version consistency test
    Then the L7 version consistency test passes with name "TestVersionMatchesChangelog"
