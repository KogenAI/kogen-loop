Feature: Bounded terminal reminders
  The fake-requester tests exercise Run and the local fake-provider test exercises Session.

  Scenario Outline: Enforce the terminal reminder contract
    When I execute the terminal-reminder case "<case>"
    Then the terminal-reminder case "<case>" passes without being skipped

    Examples:
      | case           |
      | prose_terminal |
      | zero_bytes     |
      | exhausted      |
      | budget_two     |
      | reset          |
      | terminal_first |
      | names          |
      | stops          |
      | session_events |
      | contract       |
