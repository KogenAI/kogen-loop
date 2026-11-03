Feature: Each shell call records the instants of its bounded wait
  The tool.result event of every shell call that reaches its bounded wait (45 seconds for a new
  command, 30 seconds for a retrieval with a handle) carries "shell_wait": the instant the
  command's process started ("spawned", null while no process started), the instants the wait
  started and ended ("wait_started", "wait_ended"), each RFC 3339 UTC with nine fractional
  digits, and why the wait ended ("ended_by": exit, bound or handle_yielded). tools.Tools
  returns the same record as Classified.ShellWait. Nothing the model receives changes.

  Scenario: The CLI's tool.result events carry the shell wait of each shell call that reached it
    When I run the shell wait instants CLI fixture
    Then the shell wait instants CLI observations are:
      """
      {
        "exit": 0,
        "ending": "terminal",
        "violations": [],
        "callEvents": {"exit": {}, "refused": {}, "unknown": {}, "malformed": {}, "read": {}, "end": {}},
        "results": {
          "exit": {"shell_wait": {"spawned": "instant", "wait_started": "instant", "wait_ended": "instant", "ended_by": "exit"}},
          "refused": {"rule": "pkill-killall", "error_kind": "foreign_kill", "shell_wait": {"spawned": null, "wait_started": "instant", "wait_ended": "instant", "ended_by": "exit"}},
          "unknown": {"error_kind": "unknown_shell_handle"},
          "malformed": {"malformed_class": "missing_argument"},
          "read": {}
        },
        "outputs": {
          "exit": "exit status: 3\nout\n",
          "refused": "refused: this command would stop processes this run did not start (rule: no pkill or killall; kill only pids this run created). Stop what you started with its own pid, for example kill $!, or its process group.",
          "unknown": "error: unknown shell handle",
          "malformed": "error: supply exactly one of command or handle",
          "read": "1\talpha"
        }
      }
      """

  Scenario: tools.Tools records why each shell wait ended, on controlled time
    When I run the shell wait instants driver
    Then the shell calls of the driver recorded these waits, each within its call and at the instant that ended it:
      | case      | asked | fired | status                                         | ended_by       | spawned       |
      | yield     | 45s   | yes   | running                                        | handle_yielded | set           |
      | bound     | 30s   | yes   | running                                        | bound          | same as yield |
      | release   | 30s   | no    | completed                                      | exit           | same as yield |
      | completed | 30s   | no    | completed                                      | exit           | same as yield |
      | exit      | 45s   | no    | exit status: 3                                 | exit           | set           |
      | refused   | 45s   | no    | refused                                        | exit           | none          |
      | unknown   | none  | no    | error: unknown shell handle                    | no record      | no record     |
      | malformed | none  | no    | error: supply exactly one of command or handle | no record      | no record     |
