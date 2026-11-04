Feature: The run log shows a completed shell command's exit status
  The tool.result event of a shell call that returns a completed command's result gains
  "exit_status", the integer exit status (128+signal when killed) of the same result the
  delivered text is built from. A yielding call, a refused or malformed call, an unknown handle
  and non-shell tools carry none; the retrieval that returns the completed result carries it.
  Nothing the model receives changes and no output text reaches the event stream.

  Scenario: Completed commands report their exit status; refused, malformed, unknown-handle and read_file calls do not
    When l-shell-exit-status-event: I run the scripted session "completed"
    Then l-shell-exit-status-event: the session ends with the finish call and exit code 0
    And l-shell-exit-status-event: the outputs delivered to the model are:
      """
      {"ok":"exit status: 0\n","three":"exit status: 3\n","killed":"exit status: 137\nl-ses-before-kill\n","printed":"exit status: 0\nexit status: 9\n","refused":"refused: this command would stop processes this run did not start (rule: no pkill or killall; kill only pids this run created). Stop what you started with its own pid, for example kill $!, or its process group.","unknown":"error: unknown shell handle","malformed":"error: supply exactly one of command or handle","read":"1\tl-ses-file-text"}
      """
    And l-shell-exit-status-event: each tool.result describes the output the model received
    And l-shell-exit-status-event: the event stream carries no command output or file text
    And l-shell-exit-status-event: the tool events add exactly:
      """
      {"callEvents":{"ok":{},"three":{},"killed":{},"printed":{},"refused":{},"unknown":{},"malformed":{},"read":{},"end":{}},"results":{"ok":{"exit_status":0,"shell_wait":{"spawned":"instant","wait_started":"instant","wait_ended":"instant","ended_by":"exit"}},"three":{"exit_status":3,"shell_wait":{"spawned":"instant","wait_started":"instant","wait_ended":"instant","ended_by":"exit"}},"killed":{"exit_status":137,"shell_wait":{"spawned":"instant","wait_started":"instant","wait_ended":"instant","ended_by":"exit"}},"printed":{"exit_status":0,"shell_wait":{"spawned":"instant","wait_started":"instant","wait_ended":"instant","ended_by":"exit"}},"refused":{"rule":"pkill-killall","error_kind":"foreign_kill","shell_wait":{"spawned":null,"wait_started":"instant","wait_ended":"instant","ended_by":"exit"}},"unknown":{"error_kind":"unknown_shell_handle"},"malformed":{"malformed_class":"missing_argument"},"read":{}}}
      """

  Scenario: A command that outlives its first wait reports its exit status on the retrieval that returns the completion
    When l-shell-exit-status-event: I run the scripted session "yield"
    Then l-shell-exit-status-event: the session ends with the finish call and exit code 0
    And l-shell-exit-status-event: the outputs delivered to the model are:
      """
      {"start":"{\"handle\":\"<handle>\",\"output\":\"l-ses-yield-waiting\\n\",\"status\":\"running\"}","collect":"{\"exit_status\":4,\"handle\":\"<handle>\",\"output\":\"l-ses-yield-waiting\\nl-ses-yield-done\\n\",\"status\":\"completed\"}","again":"{\"exit_status\":4,\"handle\":\"<handle>\",\"output\":\"l-ses-yield-waiting\\nl-ses-yield-done\\n\",\"status\":\"completed\"}"}
      """
    And l-shell-exit-status-event: each tool.result describes the output the model received
    And l-shell-exit-status-event: the event stream carries no command output or file text
    And l-shell-exit-status-event: the tool events add exactly:
      """
      {"callEvents":{"start":{},"collect":{},"again":{},"end":{}},"results":{"start":{"shell_wait":{"spawned":"instant","wait_started":"instant","wait_ended":"instant","ended_by":"handle_yielded"}},"collect":{"exit_status":4,"shell_wait":{"spawned":"instant","wait_started":"instant","wait_ended":"instant","ended_by":"exit"}},"again":{"exit_status":4,"shell_wait":{"spawned":"instant","wait_started":"instant","wait_ended":"instant","ended_by":"exit"}}}}
      """
