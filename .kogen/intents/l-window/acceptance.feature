Feature: Lower-only working-window byte budget
  Scenario Outline: Complete request bytes obey the configured window
    When I prepare an L-WINDOW request with budget <budget> and rendered size <bytes>
    Then the L-WINDOW outcome is "<outcome>"

    Examples:
      | budget | bytes  | outcome |
      | 0      | 524287 | pass |
      | 0      | 524288 | pass |
      | 0      | 524289 | loop/context_budget_exceeded |
      | 524288 | 524288 | pass |
      | 524288 | 524289 | loop/context_budget_exceeded |
      | 393216 | 393216 | pass |
      | 393216 | 393217 | loop/context_budget_exceeded |
      | 262144 | 204800 | pass |
      | 262144 | 307200 | loop/context_budget_exceeded |
      | 262144 | 262143 | pass |
      | 262144 | 262144 | pass |
      | 262144 | 262145 | loop/context_budget_exceeded |
      | 65536  | 65536  | pass |
      | 65537  | 65537  | pass |
      | 65535  | 204800 | loop/invalid_task |
      | -1     | 204800 | loop/invalid_task |
      | 524289 | 204800 | loop/invalid_task |
