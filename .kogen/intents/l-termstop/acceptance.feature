Feature: Stop calls after a terminal only when opted in
  Scenario Outline: Library terminal batch behavior
    When I execute the terminal-stop case "<case>"
    Then the terminal-stop case "<case>" passes without being skipped

    Examples:
      | case                 |
      | read_terminal_write  |
      | first_terminal       |
      | off_compatibility    |
      | hook_terminal_events |
      | no_terminal          |
