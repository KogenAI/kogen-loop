# Count unreaped zombies as gone in kill-group tests

Slug: loop-kill-group-test-ignores-zombies
Model: not applicable — a test-helper change with no meaningful state
Acceptance:
- .kogen/intents/loop-kill-group-test-ignores-zombies/acceptance.feature
- features/steps/loop-kill-group-test-ignores-zombies__steps.js
- features/steps/loop-kill-group-test-ignores-zombies__driver/harness.go.txt

The helper `waitGone` in `contract/sys_test.go` polls kill with signal 0 on the negative group id until ESRCH, for up to 10 seconds, and fails with `<what> remains: <err>` otherwise. On Linux a killed member that its parent has not reaped stays a zombie of the group and kill keeps succeeding, so the tests of the timed-out command's group and of the interrupted group can fail on a correct kogen-loop.

The helper now counts a group member that is a zombie as gone. On Linux a process is a zombie when the state field of its proc stat file (the first field after the last closing parenthesis) is Z; where that file cannot be read the helper behaves exactly as today. The helper still fails with the same message while any member of the group is really running. No sleep, retry or timeout is added or changed.

The change adds one new test whose fixture is: the test starts a parent process that sets itself as child subreaper and never waits for its children; that parent starts a child in a new process group and the child exits at once; before calling the helper the test confirms that kill with signal 0 on the negative group id still succeeds and that the member's stat state is Z, and fails (does not skip) when either does not hold; the test also fails when the helper returns a failure or takes longer than 2 seconds. The test is skipped on systems other than Linux. A second new test shows the helper still fails with the remains message after its deadline for a group whose member keeps running.

Scope: `contract/sys_test.go` (the helper and the new tests) and, only if it names the helper's behaviour, the README inventory row of that test. Out of scope: every production file, go.mod, go.sum, the kill sweep itself and every other test.

## Decisions
- The helper counts a member as gone when kill reports ESRCH for the group, or when every remaining member of the group has proc stat state Z; any member with another state keeps the group not gone. (evidence: contract/sys_test.go) (source: request)
- Where /proc cannot be read the helper behaves exactly as today (only ESRCH counts). (source: request)
- The failure message stays `%s remains: %v` and the 10 second deadline and 20 ms poll are unchanged. (evidence: contract/sys_test.go) (source: request)
- The acceptance drives the real `waitGone` of the working tree by overlaying a harness test file into the `contract` package (`go test -overlay`), so it does not depend on the names of the new tests. Its zombie fixture is built only on Linux. On another system (no /proc) the zombie scenario checks only that the helper's source reads `/proc/` stat files, because the new test is skipped there; the other two scenarios run everywhere. (assumption: acceptance may run on a non-Linux system, where the zombie behaviour itself cannot be observed) (source: request)
- The README inventory has no row naming the helper's behaviour, so it is not edited. (evidence: contract/README.md) (source: request)

## Source comparison
- Zombie member counts as gone, within 2 seconds, fixture confirmed before the call: scenario 1 and the new Go test.
- Running member still fails with the remains message: scenario 2 and the second new Go test.
- Existing timed-out and interrupted group tests pass unchanged, and a vanished group counts as gone: scenario 3.
- Out of scope (production files, go.mod, go.sum, kill sweep, other tests): untouched.

## Tests
- A group whose only member is an unreaped zombie is gone to waitGone within 2 seconds: new Go test in contract/sys_test.go and acceptance scenario 1 (integration)
- A group with a running member still fails waitGone with the remains message: new Go test and acceptance scenario 2 (integration)
- Groups that vanish entirely still count as gone: TestRunTimeout and TestRunInterruptStopsTheCommandAndRefusesLaterOnes run unchanged, acceptance scenario 3 (existing)

## Feasibility
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/loop-kill-group-test-ignores-zombies__driver/harness.go.txt"],"observers":["features/steps/loop-kill-group-test-ignores-zombies__steps.js"],"checks":[{"name":"good","command":"node features/steps/loop-kill-group-test-ignores-zombies__steps.js --control good","exit":0,"output":"lkgtiz observer good\n"},{"name":"bad","command":"node features/steps/loop-kill-group-test-ignores-zombies__steps.js --control bad","exit":1,"output":"lkgtiz observer bad rejected\n"}]}
