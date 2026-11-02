Feature: The loop's shell-wait tests run on controlled time
  tools.Tools.ShellAfter is a Go API seam that only tests set: a shell call asks it for the
  wait it would otherwise take (45 seconds for a new command, 30 seconds for a retrieval) and
  treats a value from the returned channel as that wait elapsing. Production leaves it nil and
  keeps the real 45-second wait. The five shell-wait tests that waited out the real wait drive
  it on controlled time, and each still fails on a deliberately broken implementation.

  Scenario: A test drives the real shell wait on controlled time through tools.Tools.ShellAfter
    Given the Go API has the shell wait seam "Tools.ShellAfter"
    When I run the shell wait seam harness
    Then the Go test "TestAcceptShellWaitSeam" in package "kogen-loop/tools" passed within 20 seconds

  Scenario: The five shell-wait tests no longer wait out the real shell wait
    When I run the Go tests "^(TestShellYieldRetrievalScope|TestShellYieldLargeMalformedOutput|TestDiscardedAttemptStopsYieldedShell|TestDiscardedAttemptStopsCompletedYieldedShell|TestShellLifecycleHandleRetrieval)$" in packages "./tools ./loop ./conformance"
    Then each of these Go tests ran and passed within 10 seconds:
      | TestShellYieldRetrievalScope                   | kogen-loop/tools       |
      | TestShellYieldLargeMalformedOutput             | kogen-loop/tools       |
      | TestDiscardedAttemptStopsYieldedShell          | kogen-loop/loop        |
      | TestDiscardedAttemptStopsCompletedYieldedShell | kogen-loop/loop        |
      | TestShellLifecycleHandleRetrieval              | kogen-loop/conformance |

  Scenario Outline: Each shell-wait test still fails on a deliberately broken implementation
    Given the Go API has the shell wait seam "Tools.ShellAfter"
    When I run the Go test "<test>" in "<dir>" on a copy with the mutation "<mutation>"
    Then the Go test "<test>" in package "<package>" failed within 30 seconds without timing out

    Examples:
      | mutation            | test                                           | dir           | package                |
      | new-command wait    | TestShellYieldRetrievalScope                   | ./tools       | kogen-loop/tools       |
      | retrieval wait      | TestShellYieldRetrievalScope                   | ./tools       | kogen-loop/tools       |
      | unbounded envelope  | TestShellYieldLargeMalformedOutput             | ./tools       | kogen-loop/tools       |
      | kept handle         | TestDiscardedAttemptStopsYieldedShell          | ./loop        | kogen-loop/loop        |
      | kept attempt groups | TestDiscardedAttemptStopsCompletedYieldedShell | ./loop        | kogen-loop/loop        |
      | lost exit status    | TestShellLifecycleHandleRetrieval              | ./conformance | kogen-loop/conformance |

  Scenario: Production keeps the real 45-second shell wait
    Given the Go API has the shell wait seam "Tools.ShellAfter"
    When I run the bounded shell wait CLI fixture "long"
    Then the bounded shell wait observations are:
      """
      {"requests":3,"firstStatus":"running","firstOutput":"partial\n","heldUntilBound":true,"yieldedByBound":true,"aliveAtYield":true,"completed":{"status":"completed","sameHandle":true,"exit_status":7,"output":"partial\ncomplete\n"},"cleaned":true,"exit":0}
      """
