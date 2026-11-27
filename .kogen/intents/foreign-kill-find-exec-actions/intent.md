# Refuse foreign kills in find -exec actions

Slug: foreign-kill-find-exec-actions
Model: not applicable — ForeignKill is a stateless text filter from a command string to a rule
Acceptance:
- .kogen/intents/foreign-kill-find-exec-actions/acceptance.feature
- features/steps/foreign-kill-find-exec-actions__steps.js
- features/steps/foreign-kill-find-exec-actions__driver/driver_test.go.txt

ForeignKill currently does not see a process-stopping command run by `find -exec` or `find -execdir`. After this change, when the command word of a command is `find`, each command of an `-exec` or `-execdir` action (the words after the option up to the action terminator, an escaped semicolon `\;` or a plus `+`) is judged with the existing rules, with the same result as if it stood alone: `find . -exec killall worker \;` and `find . -exec killall worker +` are refused with `pkill-killall`; `find . -execdir kill -9 1234 \;` is refused with `kill-foreign-pid` when pid 1234 is not owned. A find without a process-stopping action (no action, `-exec echo killall \;`, `-execdir ls {} +`, `-exec kill 4242 \;` with 4242 owned) stays allowed. Out of scope: executing find, inspecting files found by it, and rules for unrelated commands. The edit is confined to sys/foreign_kill.go and sys/foreign_kill_test.go; the ForeignKill comment drops `find -exec kill` from the list of things the filter does not see.

## Decisions
- ForeignKill judges each command of a find -exec or -execdir action with the existing rules (pkill-killall for pkill, killall and busybox killall; kill-foreign-pid for kill), including the existing owned-pid check and wrapper skipping, and returns the same rule the command would get alone. (constraint: RefusalText, Owned and the rules for other commands are unchanged) (evidence: sys/foreign_kill.go; sys/foreign_kill_test.go) (source: request)
- An action ends at the first word that is a lone semicolon (written \; in the shell) or a lone plus; an action with no terminator runs to the end of the find arguments. (decision: D2, round 1) (evidence: sys/foreign_kill.go) (assumption: treating any lone + word as a terminator, not only one after {}, matches the request example find . -exec killall worker +) (source: request)
- Only a word that is exactly -exec or -execdir starts an action; -ok and -okdir are not added. A find with no such action is not refused, and a word like killall that is only an argument of a harmless nested command (find . -exec echo killall \;) is not refused. (decision: D3, round 1) (evidence: sys/foreign_kill.go) (assumption: -ok and -okdir are not requested and stay unhandled) (source: request)
- The ForeignKill doc comment no longer lists find -exec kill among the constructs the filter does not see. (decision: D4, round 1) (evidence: sys/foreign_kill.go) (source: request)
- Acceptance drives the real ForeignKill through a Go test driver supplied via go test -overlay, so the Build need not invent a test name; the Build adds unit cases to TestForeignKillTable in sys/foreign_kill_test.go. (decision: D5, round 1) (evidence: sys/foreign_kill_test.go; features/steps/foreign-kill-busybox-applet__steps.js) (source: request)
- ForeignKill judges each command of a find -exec/-execdir action with the existing rules, ending at a lone ; or + word (decision: D1, round 1) (constraint: RefusalText, Owned and rules for other commands unchanged) (evidence: sys/foreign_kill.go; sys/foreign_kill_test.go; features/steps/foreign-kill-busybox-applet__steps.js) (assumption: Scratch copy outside the repo run with cucumber: 9/9 pass on correct, each of 7 wrong variants fails the named scenario, baseline fails the 4 refused scenarios; readiness not run by me.) (source: request)

## Source comparison
- find . -exec killall worker \; refused with pkill-killall: addressed by the first acceptance scenario (source: request).
- find . -execdir kill -9 1234 \; refused with kill-foreign-pid when 1234 is not owned: addressed by the -execdir scenario; the driver owns only pid 4242 (source: request).
- find . -exec killall worker + refused with pkill-killall: addressed by the plus scenarios, which also cover -execdir kill 1234 + (source: request).
- A find without a process-stopping action stays allowed: addressed by the allowed scenarios (no action, echo killall, ls {} +, owned pid) (source: request).
- Executing find, inspecting found files, rules for unrelated commands: omitted, out of scope; direct killall keeps its rule in a scenario (source: request).

## Tests
- find -exec and -execdir actions ended by \; or + are refused with the rule of the nested command: add refused cases to TestForeignKillTable in sys/foreign_kill_test.go (unit)
- a find without a process-stopping action stays allowed: add allowed cases (no action, -exec echo killall, -exec kill of owned pid) to TestForeignKillTable (unit)
- existing direct pkill, killall and kill rules keep their rules: existing cases in TestForeignKillTable (existing)
- end-to-end rule classification of the find cases through ForeignKill: .kogen/intents/foreign-kill-find-exec-actions/acceptance.feature (scenario)

## Feasibility
- none
