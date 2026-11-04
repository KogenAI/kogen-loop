Feature: Report any single test that waits on real time longer than its bound

  `go run scripts/slowtests.go` runs `go test ./... -count=1 -json` in the working directory, prints each
  package's wall time and every top-level test at or above the threshold (default 2s), and exits non-zero
  when such a test is not on the allowlist `scripts/slowtests-allowlist.txt`.

  Background:
    Given l-slow-test-budget-report: a synthetic Go module "example.com/synth"
    And l-slow-test-budget-report: the synthetic module file "fast/fast_test.go" contains:
      """
      package fast

      import (
      	"testing"
      	"time"
      )

      func TestFast(t *testing.T) { time.Sleep(50 * time.Millisecond) }
      """

  Scenario: Only the 3 s test is listed and, not allowlisted, it fails the run
    Given l-slow-test-budget-report: the synthetic module file "slow/slow_test.go" contains:
      """
      package slow

      import (
      	"testing"
      	"time"
      )

      func TestSlow(t *testing.T) { time.Sleep(3 * time.Second) }
      """
    When l-slow-test-budget-report: I run the slow-test report
    Then l-slow-test-budget-report: the report exits with status 1
    And l-slow-test-budget-report: the report output lines match these patterns in order:
      """
      package pass \d+\.\d\ds example\.com/synth/fast
      package pass \d+\.\d\ds example\.com/synth/slow
      slow \d+\.\d\ds example\.com/synth/slow TestSlow over
      """
    And l-slow-test-budget-report: the report output does not contain "TestFast"

  Scenario: The 3 s test on the allowlist passes the run and is still printed
    Given l-slow-test-budget-report: the synthetic module file "slow/slow_test.go" contains:
      """
      package slow

      import (
      	"testing"
      	"time"
      )

      func TestSlow(t *testing.T) { time.Sleep(3 * time.Second) }
      """
    And l-slow-test-budget-report: the synthetic module file "scripts/slowtests-allowlist.txt" contains:
      """
      # Tests allowed to take the threshold or longer: <import path> <TestName> # <reason>
      example.com/synth/slow TestSlow # real network-free timer: sleeps three seconds on purpose
      """
    When l-slow-test-budget-report: I run the slow-test report
    Then l-slow-test-budget-report: the report exits with status 0
    And l-slow-test-budget-report: the report output lines match these patterns in order:
      """
      package pass \d+\.\d\ds example\.com/synth/fast
      package pass \d+\.\d\ds example\.com/synth/slow
      slow \d+\.\d\ds example\.com/synth/slow TestSlow allowed
      """

  Scenario: A raised threshold lists no test and passes the run
    Given l-slow-test-budget-report: the synthetic module file "slow/slow_test.go" contains:
      """
      package slow

      import (
      	"testing"
      	"time"
      )

      func TestSlow(t *testing.T) { time.Sleep(3 * time.Second) }
      """
    When l-slow-test-budget-report: I run the slow-test report with the arguments "-threshold 10s"
    Then l-slow-test-budget-report: the report exits with status 0
    And l-slow-test-budget-report: the report output lines match these patterns in order:
      """
      package pass \d+\.\d\ds example\.com/synth/fast
      package pass \d+\.\d\ds example\.com/synth/slow
      """

  Scenario: Subtests are reported under their parent name and slow tests are sorted longest first
    Given l-slow-test-budget-report: the synthetic module file "parent/parent_test.go" contains:
      """
      package parent

      import (
      	"testing"
      	"time"
      )

      func TestShorter(t *testing.T) { time.Sleep(2500 * time.Millisecond) }

      func TestParent(t *testing.T) {
      	t.Run("child", func(t *testing.T) { time.Sleep(3500 * time.Millisecond) })
      }
      """
    When l-slow-test-budget-report: I run the slow-test report
    Then l-slow-test-budget-report: the report exits with status 1
    And l-slow-test-budget-report: the report output lines match these patterns in order:
      """
      package pass \d+\.\d\ds example\.com/synth/fast
      package pass \d+\.\d\ds example\.com/synth/parent
      slow \d+\.\d\ds example\.com/synth/parent TestParent over
      slow \d+\.\d\ds example\.com/synth/parent TestShorter over
      """
    And l-slow-test-budget-report: the report output does not contain "child"

  Scenario: A failing test is reported as failed, not as slow
    Given l-slow-test-budget-report: the synthetic module file "broken/broken_test.go" contains:
      """
      package broken

      import (
      	"testing"
      	"time"
      )

      func TestBroken(t *testing.T) {
      	time.Sleep(3 * time.Second)
      	t.Fatal("broken on purpose")
      }
      """
    When l-slow-test-budget-report: I run the slow-test report
    Then l-slow-test-budget-report: the report exits with status 1
    And l-slow-test-budget-report: the report output lines match these patterns in order:
      """
      package fail \d+\.\d\ds example\.com/synth/broken
      package pass \d+\.\d\ds example\.com/synth/fast
      failed \d+\.\d\ds example\.com/synth/broken TestBroken
      """
    And l-slow-test-budget-report: the report output does not contain "broken on purpose"

  Scenario: Output carries only names and durations, and go test runs with the default timeouts
    Given l-slow-test-budget-report: the synthetic module file "slow/slow_test.go" contains:
      """
      package slow

      import (
      	"fmt"
      	"testing"
      	"time"
      )

      func TestSlow(t *testing.T) {
      	t.Log("noise-from-test-log")
      	fmt.Println("noise-from-test-stdout")
      	time.Sleep(3 * time.Second)
      }
      """
    When l-slow-test-budget-report: I run the slow-test report
    Then l-slow-test-budget-report: the report exits with status 1
    And l-slow-test-budget-report: the report ran go once with exactly these arguments:
      """
      test
      ./...
      -count=1
      -json
      """
    And l-slow-test-budget-report: the report output lines match these patterns in order:
      """
      package pass \d+\.\d\ds example\.com/synth/fast
      package pass \d+\.\d\ds example\.com/synth/slow
      slow \d+\.\d\ds example\.com/synth/slow TestSlow over
      """
    And l-slow-test-budget-report: the report output does not contain "noise-from-test-log"
    And l-slow-test-budget-report: the report output does not contain "noise-from-test-stdout"
    And l-slow-test-budget-report: the report standard error is empty

  Scenario: An allowlist entry naming a test that no longer exists is reported as stale
    Given l-slow-test-budget-report: the synthetic module file "scripts/slowtests-allowlist.txt" contains:
      """
      # Tests allowed to take the threshold or longer: <import path> <TestName> # <reason>
      example.com/synth/fast TestGone # real binary: this test was removed
      """
    When l-slow-test-budget-report: I run the slow-test report
    Then l-slow-test-budget-report: the report exits with status 0
    And l-slow-test-budget-report: the report output lines match these patterns in order:
      """
      package pass \d+\.\d\ds example\.com/synth/fast
      stale example\.com/synth/fast TestGone
      """

  Scenario: An allowlist entry without a reason stops the report before go test runs
    Given l-slow-test-budget-report: the synthetic module file "scripts/slowtests-allowlist.txt" contains:
      """
      example.com/synth/fast TestFast
      """
    When l-slow-test-budget-report: I run the slow-test report
    Then l-slow-test-budget-report: the report exits with status 2
    And l-slow-test-budget-report: the report standard output is empty
    And l-slow-test-budget-report: the report standard error contains "scripts/slowtests-allowlist.txt:1:"
    And l-slow-test-budget-report: the report did not run go

  Scenario: The repository carries a commented allowlist, documents the script and keeps it out of go test ./...
    Then l-slow-test-budget-report: the repository allowlist "scripts/slowtests-allowlist.txt" starts with a comment line
    And l-slow-test-budget-report: the repository allowlist "scripts/slowtests-allowlist.txt" has 1 or more entries, each naming an existing test function of its package with a reason starting with "real binary", "real signal" or "real network-free timer"
    And l-slow-test-budget-report: the repository README.md contains "go run scripts/slowtests.go"
    And l-slow-test-budget-report: go list in the repository lists no package under "scripts"
