Feature: The remaining shell-wait tests run on controlled time
  tools.Tools.ShellAfter is the test-only seam added by L-SHELL-WAIT-SEAM: a shell call asks it
  for the wait it would otherwise take (45 seconds for a new command, 30 seconds for a retrieval)
  and treats a value from the returned channel as that wait elapsing. TestShellLifecycleYieldSnapshot,
  TestShellYieldLargeJSON and TestShellRetrievalCancellationStopsCommand drive their waits through
  it, still exercise the real yield, snapshot, large-output and cancellation paths with real
  processes, and each still fails on a deliberately broken implementation. No test in the suite
  waits out the real shell wait.

  Scenario: Each remaining shell-wait test still fails on a deliberately broken implementation
    When I run each remaining shell-wait test on its own copy broken by its mutation, stopping any test that runs over 10 seconds:
      | no round cleanup     | TestShellLifecycleYieldSnapshot            | ./conformance |
      | unbounded envelope   | TestShellYieldLargeJSON                    | ./tools       |
      | escaping ignored     | TestShellYieldLargeJSON                    | ./tools       |
      | cancel keeps command | TestShellRetrievalCancellationStopsCommand | ./tools       |
    Then on each broken copy these remaining shell-wait tests failed within 10 seconds:
      | no round cleanup     | TestShellLifecycleYieldSnapshot/explicit/hook       | kogen-loop/conformance |
      | no round cleanup     | TestShellLifecycleYieldSnapshot/explicit/no_call    | kogen-loop/conformance |
      | no round cleanup     | TestShellLifecycleYieldSnapshot/explicit/requester  | kogen-loop/conformance |
      | no round cleanup     | TestShellLifecycleYieldSnapshot/explicit/terminal   | kogen-loop/conformance |
      | no round cleanup     | TestShellLifecycleYieldSnapshot/implicit/hook       | kogen-loop/conformance |
      | no round cleanup     | TestShellLifecycleYieldSnapshot/implicit/no_call    | kogen-loop/conformance |
      | no round cleanup     | TestShellLifecycleYieldSnapshot/implicit/requester  | kogen-loop/conformance |
      | no round cleanup     | TestShellLifecycleYieldSnapshot/implicit/terminal   | kogen-loop/conformance |
      | unbounded envelope   | TestShellYieldLargeJSON/16383                       | kogen-loop/tools       |
      | unbounded envelope   | TestShellYieldLargeJSON/16384                       | kogen-loop/tools       |
      | unbounded envelope   | TestShellYieldLargeJSON/16385                       | kogen-loop/tools       |
      | unbounded envelope   | TestShellYieldLargeJSON/200000                      | kogen-loop/tools       |
      | escaping ignored     | TestShellYieldLargeJSON/16383                       | kogen-loop/tools       |
      | escaping ignored     | TestShellYieldLargeJSON/16384                       | kogen-loop/tools       |
      | escaping ignored     | TestShellYieldLargeJSON/16385                       | kogen-loop/tools       |
      | escaping ignored     | TestShellYieldLargeJSON/200000                      | kogen-loop/tools       |
      | cancel keeps command | TestShellRetrievalCancellationStopsCommand/cancel   | kogen-loop/tools       |
      | cancel keeps command | TestShellRetrievalCancellationStopsCommand/deadline | kogen-loop/tools       |

  Scenario: The remaining shell-wait tests and every other test in the suite no longer wait out the real shell wait
    When I run the whole Go suite once, stopping any test that runs over 30 seconds
    Then each of these remaining shell-wait tests ran and passed within 10 seconds:
      | TestShellLifecycleYieldSnapshot/explicit/hook       | kogen-loop/conformance |
      | TestShellLifecycleYieldSnapshot/explicit/no_call    | kogen-loop/conformance |
      | TestShellLifecycleYieldSnapshot/explicit/requester  | kogen-loop/conformance |
      | TestShellLifecycleYieldSnapshot/explicit/terminal   | kogen-loop/conformance |
      | TestShellLifecycleYieldSnapshot/implicit/hook       | kogen-loop/conformance |
      | TestShellLifecycleYieldSnapshot/implicit/no_call    | kogen-loop/conformance |
      | TestShellLifecycleYieldSnapshot/implicit/requester  | kogen-loop/conformance |
      | TestShellLifecycleYieldSnapshot/implicit/terminal   | kogen-loop/conformance |
      | TestShellYieldLargeJSON/16383                       | kogen-loop/tools       |
      | TestShellYieldLargeJSON/16384                       | kogen-loop/tools       |
      | TestShellYieldLargeJSON/16385                       | kogen-loop/tools       |
      | TestShellYieldLargeJSON/200000                      | kogen-loop/tools       |
      | TestShellRetrievalCancellationStopsCommand/cancel   | kogen-loop/tools       |
      | TestShellRetrievalCancellationStopsCommand/deadline | kogen-loop/tools       |
    And the whole Go suite ran these tests and none of its tests took 30 seconds or more:
      | TestShellLifecycleYieldSnapshot                | kogen-loop/conformance |
      | TestShellYieldLargeJSON                        | kogen-loop/tools       |
      | TestShellRetrievalCancellationStopsCommand     | kogen-loop/tools       |
      | TestShellYieldRetrievalScope                   | kogen-loop/tools       |
      | TestShellYieldLargeMalformedOutput             | kogen-loop/tools       |
      | TestDiscardedAttemptStopsYieldedShell          | kogen-loop/loop        |
      | TestDiscardedAttemptStopsCompletedYieldedShell | kogen-loop/loop        |
      | TestShellLifecycleHandleRetrieval              | kogen-loop/conformance |
