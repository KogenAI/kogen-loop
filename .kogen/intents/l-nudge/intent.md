# Remind rounds to call their terminal

Slug: l-nudge
Model: .kogen/intents/l-nudge/model.qnt invariants=bounded,terminalEnds seed=1 samples=100 steps=12
Acceptance:
- .kogen/intents/l-nudge/acceptance.feature
- features/steps/l_nudge.js

Add library-only Round.TerminalReminders int. Nonpositive values retain existing behavior. Positive values permit that many reminder continuations per Run, only on a no-call response without a terminal. Exhaustion returns EndNoCall normally. A terminal still ends immediately, including intercepted terminals. No CLI/task option, provider changes, new default, timeout increase, retry increase, installation, publication or Kogen consumer changes.

Use the existing effective Terminal list (including default finish); any member satisfies the requirement. Append one user message after replay of the no-call response: `Call one of these terminal tools to end this round: ` followed by names joined with `, ` and a final `.`. Preserve configured name order, instructions, definitions and preceding replay.

Expose Hooks.TerminalReminder func(context.Context, int, []string) error, receiving the 1-based reminder number and effective terminal names, once for each appended reminder before the next request; errors propagate unchanged. Add SessionConfig.TerminalReminders (Go only) and forward it to Round. Session emits api.EventTerminalReminder = `round.terminal_reminder` with fields `reminder` (1-based count) and `terminal_tools` (ordered string array), through its existing sequenced event sink. No task/schema/CLI setting enables this option.

Reminder continuations obey existing Progress and MaxRounds checks without resetting counters or relaxing cancellation. If a continuation stop wins, do not append or announce an unsent reminder. Subsequent requests count in Result.Requests. The counter resets on every Run, including each Session turn.

## Decisions
- Zero preserves byte-identical requests and results, with no new events (source: request)
- Reminders are bounded per round; prose then terminal succeeds, while two prose responses with budget one end without terminal (source: request)
- Record each reminder in run events and document the option in docs/contract/loop-v1.md (source: request)
- Shared-host safety requires private temporary directories, no synthetic CPU load, no kill by name/pattern, and cleanup of owned resources only (source: request)

## Source comparison
- Addressed: Request What to build and Acceptance are implemented by the option, fixed reminder, bounded counter, event hook/Session wiring, contract update and scenarios. Existing loop/loop.go:357-383 immediately ends no-call responses; only positive opt-in replaces that behavior.
- Addressed: Request Must stay is preserved by zero/default byte compatibility and no CLI/task exposure or raised defaults, tested by zero_bytes and configured checks.
- Addressed: Request reproductions use fake requesters; prose_terminal, zero_bytes and exhausted specify all three supplied examples. budget_two, terminal_first and reset establish boundary and per-round scope.
- Addressed: README caller-policy boundary remains: ending is a claim, not proof of completion. Docs qualify no-call ending with this opt-in without claiming verification.
- Addressed: Research seed (28 Oct 2026), generic form of K-REVIEWRETRY/K-SHAPEFORCE, and metric (role sessions ending without submit; extra requests per session) motivate this primitive. Request counts and reminder events expose counts; no telemetry collector or Kogen role integration is added.
- Omitted deliberately: no research experiment or live provider probing; local loop control does not change external protocol. No supplied reproducing literal is superseded.

## Tests
- Prose followed by terminal with budget one: add TestTerminalReminders/prose_terminal asserting two requests, exact reminder message and notification, replay preserved, EndTerminal and terminal name submit (regression)
- Zero preserves today's bytes and results: add TestTerminalReminders/zero_bytes comparing serialized requests and Result to the default round for prose and terminal responses, no reminder hook/event (regression)
- Two prose answers exhaust budget one: add TestTerminalReminders/exhausted asserting two requests, exactly one reminder, final response retained and EndNoCall (unit)
- Budget counts per Run: add TestTerminalReminders/budget_two sending three prose answers with budget two and asserting three requests and two ordered notifications, and TestTerminalReminders/reset repeating independent runs to prove replenishment (unit)
- Terminal responses do not trigger reminders: add TestTerminalReminders/terminal_first covering explicit submit, default finish and intercepted terminal behavior (unit)
- Reminder names effective ordered alternatives: add TestTerminalReminders/names asserting the complete appended user message with terminals submit, finish and default finish (unit)
- Continuation honors stops: add TestTerminalReminders/stops checking MaxRounds=1 on first prose returns RoundLimitError without another request or reminder, Progress stop and cancellation/hook error propagation (unit)
- Session records every reminder: add TestTerminalReminders/session_events using a local fake provider and SessionConfig.TerminalReminders=1 to assert request/response/reminder/request/response/round-end ordering, sequenced event numbers, fields, counts and second-turn reset (integration)
- Contract documents opt-in and CLI/task/default behavior stays unchanged: add TestTerminalReminders/contract checking contract text, retain strict task/capability conformance and run all configured checks (integration)

Implementation adds these callable Go tests under loop/ (not protected acceptance artifacts). Each subtest exercises real Run or Session with bounded fakes and asserts specified outputs, not merely a success marker. Acceptance rejects missing/skipped tests and verifies actual pass events. Preserve useful existing tests. Run affected tests and all configured go-format, go-test, go-vet, go-build checks, plus README race and conformance commands. No implementation edits to acceptance files are required.

## Feasibility
- No material external dependency uncertainty: standard-library engine control only; no documentation lookup required.
- Model typechecked and ran with TypeScript backend, seed 1, 100 samples, 12 steps, invariant `bounded and terminalEnds`: exit 0, no violation. Probe also ran `go test ./loop -run '^TestTerminalReminders$' -count=1`: exit 0 with `[no tests to run]`; acceptance explicitly rejects absence. (probe: exit 0, 1.5 s)
