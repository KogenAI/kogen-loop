Feature: Live and truthful positive-timeout custody
  All processes and descriptor faults belong to fresh local test children.
  The parent behavioral contract remains executable, not a prose reference.

  Scenario Outline: Stop a real custody wait while the descriptor fault stays held
    Given timeout custody inputs are:
      """json
      {"mode":"<mode>","fault":true,"actor":"zombie"}
      """
    When I exercise timeout custody with umask "<mask>"
    Then timeout custody reports exactly:
      """json
      {"error":"<error>","timedOut":false,"text":"","published":0,"requests":1,"ending":"","laterEffect":false,"returnedInput":false,"faultHeld":true,"leaderGone":true,"actorGone":true,"prompt":true,"held":true,"escaped":false}
      """
    Examples:
      | mask | mode      | error                    |
      | 077  | cancel    | context.Canceled         |
      | 022  | cancel    | context.Canceled         |
      | 077  | deadline  | context.DeadlineExceeded |
      | 022  | deadline  | context.DeadlineExceeded |
      | 077  | interrupt | interrupted SIGINT       |
      | 022  | interrupt | interrupted SIGINT       |

  Scenario Outline: A no-context sys timeout proves native disappearance despite fd exhaustion
    Given timeout custody inputs are:
      """json
      {"mode":"direct","fault":true,"actor":"none"}
      """
    When I exercise timeout custody with umask "<mask>"
    Then timeout custody reports exactly:
      """json
      {"error":"","timedOut":true,"text":"partial\n","published":0,"requests":0,"ending":"","laterEffect":false,"returnedInput":false,"faultHeld":true,"leaderGone":true,"actorGone":true,"prompt":true,"held":false,"escaped":false}
      """
    Examples:
      | mask |
      | 077  |
      | 022  |

  Scenario Outline: Default cancellation is unchanged under the same fault
    Given timeout custody inputs are:
      """json
      {"mode":"default","fault":true,"actor":"none"}
      """
    When I exercise timeout custody with umask "<mask>"
    Then timeout custody reports exactly:
      """json
      {"error":"context.Canceled","timedOut":false,"text":"","published":0,"requests":1,"ending":"","laterEffect":false,"returnedInput":false,"faultHeld":true,"leaderGone":true,"actorGone":true,"prompt":true,"held":false,"escaped":false}
      """
    Examples:
      | mask |
      | 077  |
      | 022  |

  Scenario Outline: Normal timeout feedback still reaches the next fake request
    Given timeout custody inputs are:
      """json
      {"mode":"normal","fault":false,"actor":"none"}
      """
    When I exercise timeout custody with umask "<mask>"
    Then timeout custody reports exactly:
      """json
      {"error":"","timedOut":true,"text":"timed out after 1s\nexit status: 0\npartial\n","published":1,"requests":2,"ending":"terminal","laterEffect":false,"returnedInput":true,"faultHeld":false,"leaderGone":true,"actorGone":true,"prompt":true,"held":false,"escaped":false}
      """
    Examples:
      | mask |
      | 077  |
      | 022  |

  Scenario Outline: Current membership and zombie custody differ from mere PID existence
    Given timeout custody inputs are:
      """json
      {"mode":"direct","fault":false,"actor":"<actor>"}
      """
    When I exercise timeout custody with umask "<mask>"
    Then timeout custody reports exactly:
      """json
      {"error":"","timedOut":true,"text":"partial\n","published":0,"requests":0,"ending":"","laterEffect":false,"returnedInput":false,"faultHeld":false,"leaderGone":true,"actorGone":true,"prompt":true,"held":<held>,"escaped":<escaped>}
      """
    Examples:
      | mask | actor  | held  | escaped |
      | 077  | move   | false | true    |
      | 022  | move   | false | true    |
      | 077  | zombie | true  | false   |
      | 022  | zombie | true  | false   |

  Scenario: Retain the entire parent contract with only approved scope supersession
    When I execute the complete parent shell-bound contract with the approved scope projection
    Then every original parent scenario passes exactly once

  Scenario: Cover the stopped-observer and additive wiring regressions
    When I run the focused timeout custody implementation regressions
    Then all required timeout custody regression tests run and pass
