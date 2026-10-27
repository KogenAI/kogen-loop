Feature: Process groups end with their command and foreign kills are refused

  Scenario Outline: A command that would stop a process this run did not start is refused
    Given k-safe inputs are:
      """
      {"case":"refuse","kind":"<kind>"}
      """
    When I exercise k-safe process groups
    Then k-safe reports exactly:
      """
      {"run":{"err":"<nil>","statusNonZero":true,"namesRule":true,"ruleSet":true,"timedOut":false,"siblingLive":true},"tool":{"refused":true,"namesRule":true,"siblingLive":true,"nextOk":true}}
      """

    Examples:
      | kind          |
      | pkill         |
      | killall       |
      | usr-bin-pkill |
      | kill-pid      |
      | kill-pgid     |

  Scenario: A command that ends normally leaves no background process in its group when asked to
    Given k-safe inputs are:
      """
      {"case":"group-exit"}
      """
    When I exercise k-safe process groups
    Then k-safe reports exactly:
      """
      {"on":{"err":"<nil>","status":0,"timedOut":false,"output":"","pidGone":true,"groupGone":true},"off":{"err":"<nil>","status":0,"pidLive":true}}
      """

  Scenario: Killing what the run started still works, also across two shell tool calls
    Given k-safe inputs are:
      """
      {"case":"own-kill"}
      """
    When I exercise k-safe process groups
    Then k-safe reports exactly:
      """
      {"runs":[{"err":"<nil>","status":0,"rule":""},{"err":"<nil>","status":0,"rule":""}],"tool":{"aliveBetween":true,"killRefused":false,"killStatus0":true,"gone":true}}
      """

  Scenario: The deadline path still times out and leaves no group member
    Given k-safe inputs are:
      """
      {"case":"deadline"}
      """
    When I exercise k-safe process groups
    Then k-safe reports exactly:
      """
      {"err":"<nil>","timedOut":true,"pidGone":true,"groupGone":true}
      """

  Scenario: A child that left the group with setsid is not reached and the exit sweep does not error
    Given k-safe inputs are:
      """
      {"case":"setsid"}
      """
    When I exercise k-safe process groups
    Then k-safe reports exactly:
      """
      {"err":"<nil>","status":0,"timedOut":false,"escapedLive":true}
      """
