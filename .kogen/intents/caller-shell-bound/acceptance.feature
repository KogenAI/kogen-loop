Feature: Caller-owned per-shell duration without changing unbounded Loop
  Root's D1 selects standalone Loop only. This does not switch running operations,
  change Kogen or its pin, select defaults, authorize provider studies, or claim savings.

  Scenario Outline: Preserve every original compatibility fixture and protected scope
    Given the caller-shell-bound coverage is:
      """json
      {"case":"golden","tests":["TestGenericDefinitionsMatchTheGolden","TestToolsMatchTheElixirResults","TestReplayPreservesValidSupportedFieldsWithoutManufacturingAbsentLegacyValues","TestReplayFiltersMessageContentAndFunctionCallFields","TestCallsPairWithOutputsInOrder"],"expected":null}
      """
    When I exercise caller-shell-bound with umask "<mask>"
    Then caller-shell-bound reports exactly the required passing coverage
    And the caller-shell-bound preservation digest is "83e33861c375250b22e7717143cb19bcb83a9fdb5da04581a3fd23483f1f9511"
    Examples:
      | mask |
      | 077  |
      | 022  |

  Scenario Outline: Zero remains byte-identical at the real tool and round surfaces
    Given the caller-shell-bound coverage is:
      """json
      {"case":"zero","bound":"0s","expected":{"legacy":"exit status: 7\nout\nerr\n","zero":"exit status: 7\nout\nerr\n","error":"","replayBytesEqual":true,"requests":2,"ending":"terminal","defaultDefinitionBytesEqual":true}}
      """
    When I exercise caller-shell-bound with umask "<mask>"
    Then caller-shell-bound reports exactly the required passing coverage
    Examples:
      | mask |
      | 077  |
      | 022  |

  Scenario Outline: Definitions truthfully describe only explicit caller opt-in
    Given the caller-shell-bound coverage is:
      """json
      {"case":"definitions","bound":"1s","expected":{"defaultBytesEqual":true,"zeroBytesEqual":true,"otherToolsUnchanged":true,"commandOnly":true,"stable":true,"previousUnchanged":true,"description":"Run a command with /bin/sh -c in the repository root. stdin is closed. Returns the exit status and the combined stdout and stderr. Each shell call has a caller-configured time limit of 1s. A timed-out command's process group is stopped before a timed-out result is returned. Run finite commands, including tests and browser suites, in the foreground until completion; do not poll them through repeated sleep/tail/ps calls. Only persistent commands (dev servers, watch modes) belong in the background with output to a log file; read their logs and stop them yourself.","secondDescription":"Run a command with /bin/sh -c in the repository root. stdin is closed. Returns the exit status and the combined stdout and stderr. Each shell call has a caller-configured time limit of 2s. A timed-out command's process group is stopped before a timed-out result is returned. Run finite commands, including tests and browser suites, in the foreground until completion; do not poll them through repeated sleep/tail/ps calls. Only persistent commands (dev servers, watch modes) belong in the background with output to a log file; read their logs and stop them yourself."}}
      """
    When I exercise caller-shell-bound with umask "<mask>"
    Then caller-shell-bound reports exactly the required passing coverage
    Examples:
      | mask |
      | 077  |
      | 022  |

  Scenario Outline: Direct tool expiry waits for ignoring descendants
    Given the caller-shell-bound coverage is:
      """json
      {"case":"direct","bound":"1s","mode":"<mode>","expected":{"error":"","text":"timed out after 1s\nexit status: <status>\npartial\n","childGone":true,"grandchildGone":true,"leaderGone":true,"sameGroup":true}}
      """
    When I exercise caller-shell-bound with umask "<mask>"
    Then caller-shell-bound reports exactly the required passing coverage
    Examples:
      | mask | mode           | status |
      | 077  | leader-exits   | 0      |
      | 022  | leader-exits   | 0      |
      | 077  | leader-ignores | 137    |
      | 022  | leader-ignores | 137    |

  Scenario Outline: Timeout is consumed by the next fake request only after custody ends
    Given the caller-shell-bound coverage is:
      """json
      {"case":"timeout","bound":"1s","mode":"<mode>","expected":{"error":"","text":"timed out after 1s\nexit status: <status>\npartial\n","childGone":true,"grandchildGone":true,"leaderGone":true,"sameGroup":true,"goneAtPublish":true,"published":1,"requests":2,"ending":"terminal","nextOutputs":[{"type":"function_call_output","call_id":"c1","output":"timed out after 1s\nexit status: <status>\npartial\n"}],"definitionsStable":true}}
      """
    When I exercise caller-shell-bound with umask "<mask>"
    Then caller-shell-bound reports exactly the required passing coverage
    Examples:
      | mask | mode           | status |
      | 077  | leader-exits   | 0      |
      | 022  | leader-exits   | 0      |
      | 077  | leader-ignores | 137    |
      | 022  | leader-ignores | 137    |

  Scenario Outline: Sufficient per-call bounds do not become a batch or provider deadline
    Given the caller-shell-bound coverage is:
      """json
      {"case":"per-call","bound":"2s","hold":"1.2s","expected":{"error":"","ending":"terminal","requests":2,"published":2,"outputs":["exit status: 0\nok","exit status: 0\nok"],"aggregateExceedsBound":true,"providerWaitExceedsBound":true,"definitionsStable":true}}
      """
    When I exercise caller-shell-bound with umask "<mask>"
    Then caller-shell-bound reports exactly the required passing coverage
    Examples:
      | mask |
      | 077  |
      | 022  |

  Scenario Outline: Cancellation before expiry or during timeout teardown is never feedback
    Given the caller-shell-bound coverage is:
      """json
      {"case":"cancel","bound":"<bound>","mode":"<mode>","expected":{"error":"<error>","text":"","childGone":true,"grandchildGone":true,"leaderGone":true,"sameGroup":true,"goneAtPublish":true,"published":0,"requests":1,"ending":"","nextOutputs":[],"definitionsStable":true,"laterEffect":false,"returnedInput":false}}
      """
    When I exercise caller-shell-bound with umask "<mask>"
    Then caller-shell-bound reports exactly the required passing coverage
    Examples:
      | mask | bound | mode              | error               |
      | 077  | 30s   | context-before    | context.Canceled    |
      | 022  | 30s   | context-before    | context.Canceled    |
      | 077  | 1s    | context-cleanup   | context.Canceled    |
      | 022  | 1s    | context-cleanup   | context.Canceled    |
      | 077  | 30s   | interrupt-before  | interrupted SIGTERM |
      | 022  | 30s   | interrupt-before  | interrupted SIGTERM |
      | 077  | 1s    | interrupt-cleanup | interrupted SIGTERM |
      | 022  | 1s    | interrupt-cleanup | interrupted SIGTERM |
