Feature: Stop a process group the moment it is gone
  sys.Terminate checks for group absence right after SIGTERM and then polls with a step that
  starts at 2 ms and doubles up to 100 ms, so a group that exits promptly ends custody promptly.
  The KillGroupOnExit sweep and the wait after SIGKILL poll the same way, capped at 20 ms. The
  5 second SIGKILL escalation, the signals and their order, and the rule that custody is not
  handed back while a group member can still run are unchanged.

  Scenario: A group whose members exit on SIGTERM is reported stopped in under 50 ms
    When l-terminate-prompt-exit-latency: I run the stop case "prompt"
    Then l-terminate-prompt-exit-latency: the stop case observations are exactly:
      """
      {"case":"prompt","leaders":{"SIGTERM":5},"left":0}
      """
    And l-terminate-prompt-exit-latency: the median stop took under 50 ms

  Scenario: Several groups that exit on SIGTERM, stopped together, finish in under 50 ms
    When l-terminate-prompt-exit-latency: I run the stop case "several-prompt"
    Then l-terminate-prompt-exit-latency: the stop case observations are exactly:
      """
      {"case":"several-prompt","leaders":{"SIGTERM":20},"left":0}
      """
    And l-terminate-prompt-exit-latency: the median stop took under 50 ms

  Scenario: Several groups stopped together finish within the slowest group's time plus one short step
    When l-terminate-prompt-exit-latency: I run the stop case "several-mixed"
    Then l-terminate-prompt-exit-latency: the stop case observations are exactly:
      """
      {"case":"several-mixed","leaders":{"SIGTERM":6,"exit 0":6},"left":0}
      """
    And l-terminate-prompt-exit-latency: the median stop took at least 150 ms
    And l-terminate-prompt-exit-latency: the median stop took under 300 ms

  Scenario: A group whose members ignore SIGTERM is killed only after the 5 second escalation
    When l-terminate-prompt-exit-latency: I run the stop case "ignore"
    Then l-terminate-prompt-exit-latency: the stop case observations are exactly:
      """
      {"case":"ignore","leaders":{"SIGKILL":1},"left":0,"alive_at_4500ms":true,"returned_by_4500ms":false}
      """
    And l-terminate-prompt-exit-latency: the median stop took at least 5000 ms
    And l-terminate-prompt-exit-latency: the median stop took under 6000 ms

  Scenario: Custody is not handed back while a member that ignores SIGTERM runs after its leader ended
    When l-terminate-prompt-exit-latency: I run the stop case "ignore-member"
    Then l-terminate-prompt-exit-latency: the stop case observations are exactly:
      """
      {"case":"ignore-member","leaders":{"SIGTERM":1},"left":0,"alive_at_4500ms":true,"returned_by_4500ms":false}
      """
    And l-terminate-prompt-exit-latency: the median stop took at least 5000 ms
    And l-terminate-prompt-exit-latency: the median stop took under 6000 ms

  Scenario: A group already gone costs one failed signal and no sleep
    When l-terminate-prompt-exit-latency: I run the stop case "gone"
    Then l-terminate-prompt-exit-latency: the stop case observations are exactly:
      """
      {"case":"gone","gone_before":5}
      """
    And l-terminate-prompt-exit-latency: the median stop took under 1 ms

  Scenario: A timed-out command whose group exits on SIGTERM returns within 50 ms of its timeout
    When l-terminate-prompt-exit-latency: I run the stop case "timeout"
    Then l-terminate-prompt-exit-latency: the stop case observations are exactly:
      """
      {"case":"timeout","left":0,"results":[
        {"error":"","output":"begun\n","status":143,"timed_out":true},
        {"error":"","output":"begun\n","status":143,"timed_out":true},
        {"error":"","output":"begun\n","status":143,"timed_out":true}]}
      """
    And l-terminate-prompt-exit-latency: the median stop took under 50 ms

  Scenario: The sweep of a command's leftover group ends in under 80 ms
    When l-terminate-prompt-exit-latency: I run the stop case "sweep"
    Then l-terminate-prompt-exit-latency: the stop case observations are exactly:
      """
      {"case":"sweep","left":0,"results":[
        {"error":"","output":"started\n","status":0,"timed_out":false},
        {"error":"","output":"started\n","status":0,"timed_out":false},
        {"error":"","output":"started\n","status":0,"timed_out":false},
        {"error":"","output":"started\n","status":0,"timed_out":false},
        {"error":"","output":"started\n","status":0,"timed_out":false}]}
      """
    And l-terminate-prompt-exit-latency: the median stop took under 80 ms

  Scenario: Every existing sys test is unchanged and still passes
    Given l-terminate-prompt-exit-latency: the existing sys test files are unchanged
    When l-terminate-prompt-exit-latency: I run the Go package "./sys"
    Then l-terminate-prompt-exit-latency: the Go package run passed
