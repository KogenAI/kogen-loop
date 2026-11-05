Feature: The sys suite waits on events instead of spare CPUs

  Scenario: The custody tests pass repeatedly under the race detector at GOMAXPROCS 2 without spinning a CPU
    When l-sys-suite-gomaxprocs-2: I run "go test -race -count=2 -v -run ^TestTimeoutCustody(BlockedObservation|ObservationError)$ ./sys" with GOMAXPROCS 2
    Then l-sys-suite-gomaxprocs-2: the test "TestTimeoutCustodyBlockedObservation" passed 2 times in package "github.com/KogenAI/kogen-loop/sys"
    And l-sys-suite-gomaxprocs-2: the test "TestTimeoutCustodyObservationError" passed 2 times in package "github.com/KogenAI/kogen-loop/sys"
    And l-sys-suite-gomaxprocs-2: no sys test runs a shell fixture that busy-spins a CPU

  Scenario: The Linux churn test ends on observed exits and runs alone
    Then l-sys-suite-gomaxprocs-2: the sys package vets for "linux/amd64"
    And l-sys-suite-gomaxprocs-2: TestLinuxTimeoutObservationChurn ends on 200 observed exits per worker and does not run in parallel

  Scenario: TestRunKillGroupOnExit judges the group at the moment Run and Terminate return
    When l-sys-suite-gomaxprocs-2: I run "go test -count=5 -v -run ^TestRunKillGroupOnExit$ ./contract" with GOMAXPROCS 2
    Then l-sys-suite-gomaxprocs-2: the test "TestRunKillGroupOnExit" passed 5 times in package "github.com/KogenAI/kogen-loop/contract"
    And l-sys-suite-gomaxprocs-2: TestRunKillGroupOnExit observes live group members with one ps listing and no sleep, poll or deadline
