# Reduce shell handle polling cost

Slug: l-shell-poll-cost
Model: not applicable — only the wait duration changes; shell lifecycle states, custody and handle semantics remain unchanged
Acceptance:
- .kogen/intents/l-shell-poll-cost/acceptance.feature
- features/steps/l_shell_poll_cost.js

Fix L-SHELL-POLL-COST in kogen-loop (Studio issue d49d2527-8eaf-4655-bc66-ae5733d404a3, top loop priority, 1 Nov 2026). Keep the initial shell wait at one second; handle retrieval waits up to 30 seconds and returns immediately on completion. Replace the current one-second retrieval wait, not the handle protocol. No new command, flag or option. No Kogen vendoring/pin, installation, provider integration or CHANGELOG changes.

## Decisions
- Keep bounded waits, cumulative progress, live commands after yielding, agent stop/continue opportunities, responsive cancellation/deadlines and round cleanup. Waiting itself must never kill a hung command. Preserve quick command text and completed-handle output/exit status. (source: request)
- Use retrieval waits up to 30 seconds, returning immediately on completion. Progress and agent decisions occur at those returns; several-second commands need constant requests. Update L-SHELL-HANG timing watchdogs without weakening lifecycle assertions. (source: answer 1)
- Deterministic scripted providers and real local processes only; no paid requests. Report requests per long command before and after. (source: request)

## Source comparison
- Addressed: request Need and answer 1 by the initial-one-second/retrieval-30-second contract above; README and tools/tools.go currently describe/use one second for both and must be updated, along with maintained caller contract and model-facing descriptions where applicable.
- Addressed: request Acceptance evidence by acceptance.feature's real CLI/scripted-provider runs at 4 and 8 seconds, requiring three requests each (start, retrieve, finish after completed output). Implementation regression tests must additionally exercise a hung retrieval, cancellation during the longer wait, and all L-SHELL-HANG lifecycle guarantees.
- Addressed as historical motivation, not invented new measurements: request reports 14 tasks at 1a3eb18, 142 commands, 44 still running at one second, 172 retrievals/314 calls, 104 retrieval-only/309 requests, $0.47/$2.09 and 235 seconds, 95 unchanged snapshots; long review 26/58 requests and $0.26/$0.57, one handle 13 retrievals; 8a2fcda long tasks averaged 32 requests/$0.31 versus 58–61/$0.55–0.57. Kogen re-pin 8afac45 carries the loop; L-SHELL-HANG commit 99d858a introduced the bounded handle behavior. These observational cost figures are not deterministic cost thresholds. Short tasks must retain their initial wait behavior.
- Superseded: exact one-second retrieval timing only. Omitted deliberately: paid cost remeasurement and changes to Kogen itself; neither is needed for this repository fix. No requested lifecycle guarantee is removed.

## Tests
- Several-second runtime must not create one model request per second: real CLI with local scripted provider and real sleep/print/exit commands at 4 and 8 seconds, recording actual before/after request counts and checking cumulative final output and exit 7 (regression)
- Initial yield and quick completion stay compatible: retain L-SHELL-HANG quick and initial-yield cases (existing)
- Retrieval is bounded at 30 seconds, completion wakes it early, and waiting does not kill the command: update L-SHELL-HANG join fixture watchdogs to the new bound, retain alive and cumulative-output checks, and add focused process coverage of the changed wait (integration)
- Cancellation/deadlines remain responsive during retrieval and round termination cleans up: retain lifecycle tests and add cancellation while a handle retrieval is waiting, rather than merely between calls (integration)

## Feasibility
- Repository inspection locates the shared one-second timer at tools/tools.go:630; retrieval already has completion and context channels. No new external protocol or library capability is required.
- evidence: {"id":"poll-observer","kind":"observer","inputs":["features/steps/l_shell_poll_cost.js"],"observers":["features/steps/l_shell_poll_cost.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/l_shell_poll_cost.js good","exit":0,"output":"poll observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/l_shell_poll_cost.js bad","exit":1,"output":"poll observer rejected\n"}]}
