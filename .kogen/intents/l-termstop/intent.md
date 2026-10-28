# Skip calls after the first terminal

Slug: l-termstop
Model: .kogen/intents/l-termstop/model.qnt invariants=Safe seed=28 samples=20 steps=4
Acceptance:
- .kogen/intents/l-termstop/acceptance.feature
- features/steps/l_termstop.js

Add library-only `loop.Round.StopAfterTerminal bool`, default false. When true, the first terminal (named in the effective Terminal list or returned by a handled hook) becomes Result.Terminal. All later calls in that response batch, including later terminal names, receive an ordinary non-terminal output with exact text `skipped: earlier terminal call ended the round`. Do not execute them or invoke HandleCall for them. Preserve replay and append one call.Output per skipped call. The chosen terminal itself keeps today's no-output semantics. Keep BeforeCall and AfterCall for skipped calls (AfterCall receives the skip output and terminal=false), so event-producing hooks count them as ordinary calls/results. Cancellation and hook errors retain their existing precedence.

No CLI/task/session setting, event schema change, limits change, provider change or new dependency. Default false must preserve existing behavior and bytes, including last-terminal-wins and execution after a terminal. Update docs/contract/loop-v1.md and affected public comments to distinguish these modes. Do not change Kogen consumers, pins or installation.

## Decisions
- Make stopping after a terminal opt-in on Round; off preserves byte-identical behavior. (source: request)
- Keep skipped calls as ordinary transcript results and count them through normal run event hooks; the first terminal wins only when opted in. (source: request)
- No CLI and no changed limits. (source: request)

## Source comparison
- Addressed: request L-TERMSTOP research seed 28 Oct 2026, batch [read, terminal, write], default-off compatibility, first-terminal selection, skipped results, event accounting and docs/contract are covered above and by acceptance cases below.
- Superseded only when opted in: loop/loop.go Run and docs/contract/loop-v1.md section 2 currently execute all calls and keep the last terminal. False retains that complete behavior.
- Addressed: research metric is tool executions and wall time after terminal with no verdict changes. Tests observe execution counts and preserved terminal claims; no timing threshold or benchmark infrastructure is introduced.
- Addressed: shared-host constraints apply to all implementation/testing: use temp directories, no synthetic CPU load, never stop processes by name/pattern, and only stop PIDs started by the test itself.
- Omitted deliberately: no paid research, CLI feature, new limits or delivery-policy changes are requested or authorized. Configured checks remain unchanged.

## Tests
- Opted-in [read, terminal, write] runs read, skips write, returns terminal and appends the exact skipped output with the write call ID: TestStopAfterTerminal/read_terminal_write (regression)
- Multiple terminals select the first and give every subsequent call, including terminals, a skip output: TestStopAfterTerminal/first_terminal (unit)
- Default false and explicit false preserve existing transcript bytes, hook observations, execution and last-terminal selection: TestStopAfterTerminal/off_compatibility (regression)
- Hook-produced terminals also stop execution, skipped HandleCall is not invoked, and BeforeCall/AfterCall count skipped calls and results: TestStopAfterTerminal/hook_terminal_events (integration)
- With no terminal all calls still run and normal continuation is unchanged: TestStopAfterTerminal/no_terminal (unit)
- All configured checks remain passing: existing project checks plus README race/conformance commands (existing)

Implement the named Go subtests in loop using a bounded fake Requester and real loop.Run, reusing existing test helpers. Expectations must test observable results and tool effects, not private structure. Use real temp-file read/write tools for the reproducing case. Compare default/false transcript serialization byte-for-byte to independently constructed existing expectations, not merely to each other. Event coverage should record hooks as used by Session (BeforeCall emits call, non-terminal AfterCall emits result); do not expose a Session option. Also retain current cancellation/error tests unchanged. Run affected tests during implementation, then configured checks and acceptance; run `go test -race ./...` and `go test ./conformance -count=1` before delivery.

## Feasibility
- Local state model typechecked with Kogen Quint: exit 0, 0.3 s. Earlier draft failed because enabled is reserved; corrected to stop. No external dependencies or protocol assumptions are changed.
