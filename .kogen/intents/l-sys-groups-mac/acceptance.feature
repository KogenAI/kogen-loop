Feature: A finished command's empty process group is not live on macOS

  On macOS (no /proc) the supervisor and its keeper decide whether a process group
  still has members from a `ps -A -o pid=,pgid=,stat=` listing. That ps process is
  born into the group it lists, so it must not count as a member: otherwise a keeper
  is left behind and Session.LiveGroups keeps reporting an ended, empty group as live.

  Scenario: The ps membership listing does not count its own ps process
    When I observe a lone group and a group with a live sleep child through the ps listing
    Then the ps listing observations are exactly:
      """
      {"alone": {"others": false, "error": ""}, "member": {"others": true, "error": ""}}
      """

  Scenario: An ended command's empty group is not live and a leftover group still is
    Given the existing live-groups test file is unchanged
    When I run the Go test "TestLiveGroupsAndRetireKeepALeftoverGroup" in package "./sys" in 5 separate runs
    Then each of those runs passed that test

  Scenario: Reaping, teardown, cancellation and foreign-kill refusal behave as today
    When I run the whole Go package "./sys" once
    Then the Go package run passed
    And the production files in sys add no sleep and the module adds no dependency
