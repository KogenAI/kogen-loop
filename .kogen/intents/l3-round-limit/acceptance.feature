Feature: Caller-set round limit and no-progress stop in loop.Run

  Scenario: A never-converging provider stops at MaxRounds
    Given the round-limit case is:
      """
      {"maxRounds": 4, "script": 10}
      """
    When I run loop.Run with that case
    Then the round-limit observation includes:
      """
      {"requests": 4, "limit": 4, "ending": "", "noProgress": null, "otherError": null}
      """

  Scenario: MaxRounds 0 means no limit
    Given the round-limit case is:
      """
      {"maxRounds": 0, "script": 10}
      """
    When I run loop.Run with that case
    Then the round-limit observation includes:
      """
      {"requests": 11, "limit": null, "ending": "terminal", "otherError": null}
      """

  Scenario: A terminal answer on the limit round is a normal ending
    Given the round-limit case is:
      """
      {"maxRounds": 4, "script": 3}
      """
    When I run loop.Run with that case
    Then the round-limit observation includes:
      """
      {"requests": 4, "limit": null, "ending": "terminal", "otherError": null}
      """

  Scenario: Three identical fingerprints stop the run
    Given the round-limit case is:
      """
      {"maxRounds": 0, "script": 10, "noProgress": true, "fingerprints": ["tree1|red1", "tree1|red1", "tree1|red1", "tree2|red1"]}
      """
    When I run loop.Run with that case
    Then the round-limit observation includes:
      """
      {"requests": 3, "limit": null, "noProgressRounds": 3, "noProgress": {"rounds": [1, 2, 3], "fingerprint": "tree1|red1"}, "otherError": null}
      """

  Scenario: A changing fingerprint resets the count
    Given the round-limit case is:
      """
      {"maxRounds": 0, "script": 6, "noProgress": true, "fingerprints": ["a", "a", "b", "b", "a", "a"]}
      """
    When I run loop.Run with that case
    Then the round-limit observation includes:
      """
      {"requests": 7, "noProgress": null, "limit": null, "ending": "terminal", "otherError": null}
      """

  Scenario: Without the hook an identical state never stops the run early
    Given the round-limit case is:
      """
      {"maxRounds": 0, "script": 10, "noProgress": false, "fingerprints": ["same"]}
      """
    When I run loop.Run with that case
    Then the round-limit observation includes:
      """
      {"requests": 11, "noProgress": null, "limit": null, "ending": "terminal"}
      """

  Scenario: No-progress fires before a larger round limit
    Given the round-limit case is:
      """
      {"maxRounds": 10, "script": 20, "noProgress": true, "fingerprints": ["same"]}
      """
    When I run loop.Run with that case
    Then the round-limit observation includes:
      """
      {"requests": 3, "limit": null, "noProgress": {"rounds": [1, 2, 3], "fingerprint": "same"}}
      """

  Scenario: The documentation describes both options without defaults
    Then the documentation says "MaxRounds" is not defaulted
