# Cancel discarded shells before joining them

Slug: l-retire-cancel-all-then-stop
Model: .kogen/intents/l-retire-cancel-all-then-stop/model.qnt invariants=Safe,Scoped seed=17 samples=100 steps=20
Acceptance:
- .kogen/intents/l-retire-cancel-all-then-stop/acceptance.feature
- features/steps/l_retire_batch.js
- features/steps/l_retire_batch_test.go.txt
- features/steps/l_shell_wait_seam.js
- features/steps/l_shell_wait_seam_test.go.txt
- features/steps/l_bounded_shell_wait.js

Change discarded streaming-attempt retirement in loop/overlap.go so every yielded handle belonging to the discarded attempt is cancelled before any blocking join. Join all those commands before retirement returns and before retry execution starts. Replace the serial N-grace-period delay with one shared grace period, for arbitrary N; the reproducer uses three TERM-ignoring yielded commands and requires real retirement time strictly less than 10 seconds (two times the existing 5-second grace). Do not shorten the grace or change shell custody to meet the bound. EndShellRound in tools/tools.go already demonstrates cancel-all then stop-all. A minimal cancel-without-wait operation beside CancelShellHandle is appropriate if needed; keep cancellation scoped to the discarded handles, not the whole registry. Keep the synchronous CancelShellHandle join semantics and existing round cleanup.

Preserve every discarded handle ending before retry, attempt-group ownership filtering, and the 45-second new-command / 30-second retrieval wait. Groups belonging to another/new attempt must not be signalled. Keep the existing l-shell-wait-seam acceptance unchanged, including its mutation anchors: `s.tl.CancelShellHandle(result.Handle)` and `sys.Terminate(owned)` must each remain exactly once in loop/overlap.go. The cancel-only pass must not expire the registry entries before the existing join pass can find them. Do not replace retirement with EndShellRound, which would cancel unrelated handles. Keep unrelated bounded-wait logic and log fields unchanged. No Kogen vendor/pin changes, configuration, new settings, global installation or CHANGELOG entry.

The independent private-copy Go fixture calls the real stage Done/Abort path using real local process groups and the existing ShellAfter seam, not a simulated stop. It verifies all three yielded handles become unknown and no groups remain even on a latency failure. Its good control uses the real existing EndShellRound batch lifecycle; its bad control uses baseline serial retirement and must reach the latency assertion. Test-runner JSON must show the named test ran and passed, never merely an exit code or compiler diagnostic. The model abstracts three old handles (1–3); other handles are excluded and retry requires all old handles ended. Timing is established by processes rather than this abstraction.

## Decisions
- Cancel every discarded yielded handle first, then wait for every handle before retry, with one grace period independent of N. (source: request)
- Keep attempt ownership, the mutation anchors and 45 s / 30 s waits unchanged; no bounded-wait or logging work. (source: request)
- Use three TERM-ignoring yielded shells and the strict less-than-two-graces real-time regression. (source: request)

## Source comparison
- Addressed: request L-RETIRE-CANCEL-ALL-THEN-STOP Problem and Need map to the cancel-all/join-all contract above and the first acceptance scenario. Current inspected stage.retire serially invokes CancelShellHandle, which removes and stops a single registry job; inspected EndShellRound already cancels the registry snapshot before joining. Source line numbers have shifted (retire 86–120; EndShellRound now 620–633).
- Addressed: Need's every-handle-before-retry and kept-handle / kept-attempt-group anchors map to preserved join semantics and the unchanged seam mutation outline copied into acceptance; wait preservation maps to the unchanged seam harness and production CLI scenario. Groups of other attempts remain outside cancellation, explicitly required above and in implementation regression coverage below.
- Addressed as historical evidence, not a new runtime requirement: climb/loop/LANE.md climb-loop-3 L1 and cl3_turn_bound_test.go.txt line 100 reportedly measured discarded retirement at 5.04 / 10.08 / 15.11 s for 1 / 2 / 3 TERM-ignoring shells versus 5.03–5.04 s at round end. These research files are not present in this checkout; acceptance reconstructs the stated three-shell reproducer with repository helpers instead of depending on an absent fixture.
- Addressed limitation: 149 provider attempts for 148 requests contained zero retries and zero discarded attempts; this is a fixture latency bound, not observed cell loss. The 408 s turn is NOT explained by it. The unexplained 442 s / 370 s stalls remain open; no diagnosis or remedy for those is claimed.
- Addressed: Probe asks for three shells under two graces and unchanged l-shell-wait-seam acceptance; the complete seam scenarios are retained here, including all six mutation cases and real 45 s CLI wait. Independence and Unblocks constrain scope as above; L-SHELL-WAIT-INSTANTS and L-ATTEMPT-GAP-LOAD are not implemented by this change. No requested product behavior is deliberately omitted or superseded.

## Tests
- Retirement of three TERM-ignoring yielded shells takes less than 10 seconds without changing grace, and expires every handle after stopping its group: independent TestAcceptRetireBatch plus add the reproducer to loop/shell_attempt_test.go (regression)
- Every discarded command ends before retry can proceed: keep TestDiscardedAttemptStopsYieldedShell and TestDiscardedAttemptStopsCompletedYieldedShell and their unchanged seam mutation cases (existing)
- Retirement does not signal groups or cancel handles belonging to another/new attempt: add a local-process ownership regression in loop/shell_attempt_test.go that keeps an unrelated yielded command alive and usable while discarding the three old handles (integration)
- The 45 s new wait and 30 s retrieval wait, result bounds and exit status stay unchanged: existing complete l-shell-wait-seam acceptance scenarios, copied verbatim in behavior into this feature (existing)

## Feasibility
- No external service, dependency or protocol is changed; repository standard-library process lifecycle and existing controlled shell-wait seam are used. No external documentation lookup was necessary.
- The submitted model's identical bytes typechecked with Kogen Quint in a scratch probe (exit 0, 0.7 s).
- evidence: {"id":"retire-observer","kind":"observer","inputs":["features/steps/l_retire_batch.js","features/steps/l_retire_batch_test.go.txt"],"observers":["features/steps/l_retire_batch.js","features/steps/l_retire_batch_test.go.txt"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/l_retire_batch.js good","exit":0,"output":"retire observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/l_retire_batch.js bad","exit":1,"output":"retire observer rejected serial retirement\n"}]}
