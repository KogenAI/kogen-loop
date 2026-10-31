Feature: Tell the agent to finish when its checks pass
  The default instructions gain one final sentence and nothing else changes.

  Scenario: The default instructions end with the stop-at-green sentence
    When I read the L stop-at-green default instructions
    Then the L stop-at-green default instructions end with "When your checks pass, call finish right away: no extra re-reads, re-runs or polishing after a pass."
    And the L stop-at-green default instructions are exactly
      """
      You are a coding agent. Work in the working directory with the tools you are given. Read what you need, make the changes the task asks for and check your work with the available tools. When you are done, call the finish tool with a summary of what you did. Your finish is a claim: the caller verifies the work independently, so say plainly what you did not check or could not do. When your checks pass, call finish right away: no extra re-reads, re-runs or polishing after a pass.
      """

  Scenario: A fresh CLI session sends the sentence once
    When a fresh L stop-at-green CLI session runs with empty instructions
    Then the L stop-at-green session ended by its finish call after one request
    And the L stop-at-green request instructions are exactly
      """
      You are a coding agent. Work in the working directory with the tools you are given. Read what you need, make the changes the task asks for and check your work with the available tools. When you are done, call the finish tool with a summary of what you did. Your finish is a claim: the caller verifies the work independently, so say plainly what you did not check or could not do. When your checks pass, call finish right away: no extra re-reads, re-runs or polishing after a pass.
      """
    And the L stop-at-green request body contains "When your checks pass, call finish right away: no extra re-reads, re-runs or polishing after a pass." exactly once
