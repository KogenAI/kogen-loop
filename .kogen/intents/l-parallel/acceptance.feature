Feature: Disable provider parallel tool calls without changing defaults
  Scenario Outline: Exercise the parallel-tool-call contract through Go boundaries
    When I execute the parallel tool calls contract tests
    Then the parallel tool calls test "<package>" "<test>" must have passed
    Examples:
      | package             | test                                |
      | kogen-loop/provider | TestParallelToolCallsDefault        |
      | kogen-loop/provider | TestParallelToolCallsResponses      |
      | kogen-loop/provider | TestParallelToolCallsMessages       |
      | kogen-loop/provider | TestParallelToolCallsUnsupported    |
      | kogen-loop/loop     | TestParallelToolCallsLoop           |
      | kogen-loop/loop     | TestParallelToolCallsBatch          |
