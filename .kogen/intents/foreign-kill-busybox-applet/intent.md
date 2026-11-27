# Refuse BusyBox killall applet in ForeignKill

Slug: foreign-kill-busybox-applet
Model: not applicable — ForeignKill is a stateless text filter from a command string to a rule
Acceptance:
- .kogen/intents/foreign-kill-busybox-applet/acceptance.feature
- features/steps/foreign-kill-busybox-applet__steps.js
- features/steps/foreign-kill-busybox-applet__driver/driver_test.go.txt

ForeignKill currently does not see `busybox killall`. After this change a command whose command word is `busybox` and whose first argument is `killall` is refused with the existing rule `pkill-killall`, also when ordinary wrappers (assignments, env, sudo, timeout, exec, nohup, time, command) precede BusyBox, and also when busybox is given by path. `busybox echo killall` and other BusyBox applets stay allowed. Existing direct pkill, killall and kill rules are unchanged. Out of scope: the refusal text, process ownership checks, and other BusyBox applets. The edit is confined to sys/foreign_kill.go and sys/foreign_kill_test.go; the ForeignKill comment drops `busybox killall` from the list of things the filter does not see.

## Decisions
- ForeignKill refuses a command whose command word (after the existing assignment and wrapper skipping in commandWord, e.g. env, sudo, timeout) is busybox and whose first argument is exactly killall, returning the existing rule pkill-killall. (decision: D1, round 1) (constraint: Only the killall applet is added; other BusyBox applets, RefusalText, and Owned are unchanged) (evidence: sys/foreign_kill.go) (source: request)
- The ForeignKill doc comment no longer lists busybox killall among the constructs the filter does not see. (decision: D2, round 1) (evidence: sys/foreign_kill.go) (source: request)
- Acceptance drives the real ForeignKill through a Go test driver supplied via go test -overlay (not committed into sys), so no test name must be invented by the Build; the Build adds unit cases to sys/foreign_kill_test.go. (evidence: sys/foreign_kill_test.go; features/steps/caller_shell_bound.js) (assumption: Go test overlay path resolution was observed only in a scratch copy of the checkout) (source: request)
- Acceptance drives the real ForeignKill through a Go test driver supplied via go test -overlay (not committed into sys), so no test name must be invented by the Build; the Build adds unit cases to sys/foreign_kill_test.go. (decision: D3, round 1) (evidence: sys/foreign_kill_test.go; features/steps/caller_shell_bound.js) (assumption: Go test overlay path resolution was observed only in a scratch copy of the checkout.) (source: request)

## Source comparison
- busybox killall worker refused with pkill-killall: addressed by the first three scenarios of acceptance.feature (source: request).
- env MODE=fast busybox killall worker refused (wrapped invocation): addressed by the wrapped scenarios, including sudo timeout and a /bin/busybox path (source: request).
- busybox echo killall remains allowed: addressed by an allowed scenario; busybox ls covers other applets staying untouched (source: request).
- Existing direct pkill, killall and kill rules unchanged: addressed by direct scenarios for killall, pkill -f and kill 1234 plus the existing TestForeignKillTable (source: request).
- Refusal text and process ownership: omitted, out of scope (source: request).

## Tests
- busybox killall, plain and behind wrappers, is refused with pkill-killall: add refused cases `busybox killall worker`, `env MODE=fast busybox killall worker` to TestForeignKillTable in sys/foreign_kill_test.go (unit)
- busybox with a non-killall applet or killall only as an argument is allowed: add allowed cases `busybox echo killall` to TestForeignKillTable (unit)
- existing direct pkill, killall and kill rules keep their rules: existing cases in TestForeignKillTable (existing)
- end-to-end rule classification of the busybox cases through ForeignKill: .kogen/intents/foreign-kill-busybox-applet/acceptance.feature (scenario)

## Feasibility
- none
