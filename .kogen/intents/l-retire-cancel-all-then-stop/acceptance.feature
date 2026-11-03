Feature: Retire discarded shells within one shared grace period
  Scenario: Three TERM-ignoring yielded shells do not serialize teardown
    When I retire three TERM-ignoring yielded shells
    Then all three discarded handles and groups end within less than 10 seconds

  Scenario: Controlled shell waits preserve 45 and 30 second arguments
    Given the Go API has the shell wait seam "Tools.ShellAfter"
    When I run the shell wait seam harness
    Then the Go test "TestAcceptShellWaitSeam" in package "kogen-loop/tools" passed within 20 seconds

  Scenario: Existing shell wait tests stay fast and correct
    When I run the Go tests "^(TestShellYieldRetrievalScope|TestShellYieldLargeMalformedOutput|TestDiscardedAttemptStopsYieldedShell|TestDiscardedAttemptStopsCompletedYieldedShell|TestShellLifecycleHandleRetrieval)$" in packages "./tools ./loop ./conformance"
    Then each of these Go tests ran and passed within 10 seconds:
      | TestShellYieldRetrievalScope                   | kogen-loop/tools       |
      | TestShellYieldLargeMalformedOutput             | kogen-loop/tools       |
      | TestDiscardedAttemptStopsYieldedShell          | kogen-loop/loop        |
      | TestDiscardedAttemptStopsCompletedYieldedShell | kogen-loop/loop        |
      | TestShellLifecycleHandleRetrieval              | kogen-loop/conformance |

  Scenario Outline: Unchanged mutation anchors still detect broken custody and wait behavior
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

  Scenario: Production still waits 45 seconds
    Given the Go API has the shell wait seam "Tools.ShellAfter"
    When I run the bounded shell wait CLI fixture "long"
    Then the bounded shell wait observations are:
      """
      {"requests":3,"firstStatus":"running","firstOutput":"partial\n","heldUntilBound":true,"yieldedByBound":true,"aliveAtYield":true,"completed":{"status":"completed","sameHandle":true,"exit_status":7,"output":"partial\ncomplete\n"},"cleaned":true,"exit":0}
      """
