Feature: Opt-in read ledger carried across a caller working-window reset
  Scenario Outline: Library ledger behavior
    When I execute the read-ledger case "<case>"
    Then the read-ledger case "<case>" passes without being skipped
    Examples:
      | case             |
      | text_metadata    |
      | reset_two_reads  |
      | image_reference  |
      | cap_fifo         |
      | reset_events     |
      | off_identical    |
      | budget_unchanged |
