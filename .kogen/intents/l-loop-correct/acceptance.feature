Feature: Preserve failed writes and report refusals
  Scenario Outline: Audit faults and compatibility
    When I execute loop correctness test "<test>" for "<expected>"
    Then loop correctness test "<test>" ran and passed
    Examples:
      | test | expected |
      | TestLoopCorrectFailedWrite | src/config.go preimage survives failed 65536-byte replacement |
      | TestLoopCorrectRefusal | I cannot perform that request. |
      | TestLoopCorrectMixed | Before\nI cannot perform that request.\nAfter |
      | TestLoopCorrectMissingSession | missing_session: Session is required |
      | TestLoopCorrectCompatibility | normal bytes, modes, symlinks and protection unchanged |

  Scenario: Race checks
    When I execute loop correctness race checks
    Then loop correctness race checks pass
