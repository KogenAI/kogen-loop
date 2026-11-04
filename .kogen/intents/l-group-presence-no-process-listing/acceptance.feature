Feature: Answer group presence without ps on macOS
  On macOS, sys answers "does this process group still have a live member other than the
  asking process" from the kernel's process-group query (sysctl KERN_PROC_PGRP), the query
  timeout observation already uses, instead of starting a ps listing. Zombies are not
  members, the asking process is excluded, and a failed query is an error that callers treat
  as presence. The /proc path and the ps listing stay for other systems.

  Scenario: A group with one live member is present; a group of only an unreaped zombie and an empty group are absent
    When l-group-presence-no-process-listing: I ask the group presence questions on macOS
    Then l-group-presence-no-process-listing: the answers include exactly:
      """
      {"group_with_one_live_member": {"present": true, "error": ""},
       "group_with_only_an_unreaped_zombie": {"present": false, "error": ""},
       "empty_group": {"present": false, "error": ""}}
      """

  Scenario: The asking process is never counted as a member of its own group
    When l-group-presence-no-process-listing: I ask the group presence questions on macOS
    Then l-group-presence-no-process-listing: the answers include exactly:
      """
      {"own_group_asked_by_itself": {"present": false, "error": ""},
       "own_group_asked_without_exclusion": {"present": true, "error": ""}}
      """

  Scenario: A failed kernel query is returned as an error, not as absence
    When l-group-presence-no-process-listing: I ask the group presence questions on macOS
    Then l-group-presence-no-process-listing: the answers include exactly:
      """
      {"failed_kernel_query": {"error_is_the_query_error": true, "queried_the_asked_group": true}}
      """

  Scenario: Asking 20 times takes under 5 ms in total and starts no child process
    When l-group-presence-no-process-listing: I ask the group presence questions on macOS
    Then l-group-presence-no-process-listing: the answers include exactly:
      """
      {"timed_answers": {"false <nil>": 100},
       "children_started_while_timed": false,
       "ps_started": 0}
      """
    And l-group-presence-no-process-listing: the median of the 5 rounds of 20 questions took under 5 ms

  Scenario: No event, tool text or contract row changes
    Then l-group-presence-no-process-listing: the files that carry events, tool text and contract rows are unchanged

  Scenario: Every existing sys test is unchanged and still passes
    Given l-group-presence-no-process-listing: the existing sys test files are unchanged
    When l-group-presence-no-process-listing: I run the Go package "./sys"
    Then l-group-presence-no-process-listing: the Go package run passed
