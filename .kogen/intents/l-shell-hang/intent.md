# Bound shell waits without killing commands

Slug: l-shell-hang
Model: .kogen/intents/l-shell-hang/model.qnt invariants=YieldKeepsAlive,EndStops,CompletedStops seed=1 samples=100 steps=20
Acceptance:
- .kogen/intents/l-shell-hang/acceptance.feature
- features/steps/l_shell_hang.js

Fix L-SHELL-HANG (kogen-loop/shell-call-unbounded-wait). Shell execution must return control to the agent while long commands continue. Apply the behavior to generic tools, loop.Run and the shipped cmd/kogen-loop through loop.Session's installed HandleCall hook, not just bare Hooks{}. Do not change Kogen's 120 s approval limit, publish a release, update a consumer pin or introduce paid provider calls.

## Decisions
- Yield without killing the command; provide a handle and bounded retrieval waits; retain cancellation and round-end cleanup. (source: answer 1)
- The run deadline remains independent; a long acceptance command must not consume the entire agent wall. (source: request)
- Approval regression must fail fast within an explicit short bound, well below 120 s. (source: request)

Technical contract: use a fixed one-second foreground wait for each shell invocation, including retrieval. This is a yield threshold, not an execution timeout; no new task setting or sys.Options.Timeout change. Preserve shell's existing required command usage for launching, and add an alternative string argument `handle` to the same shell tool for retrieval (exactly one of command or handle). Reusing shell avoids a missing retrieval tool on tasks explicitly enabling only shell. Advertise both forms and the bounded-wait contract in its definition; remove instructions forbidding polling finite commands and the old unbounded foreground promise.

A command that finishes before yielding retains the existing text `exit status: <integer>\n<combined stdout/stderr>`. Otherwise return JSON text with `status: "running"`, an opaque nonempty string `handle`, and `output` containing the captured combined output so far. Handle retrieval waits at most one second for completion, then returns either the same running shape or JSON with `status: "completed"`, the same `handle`, integer `exit_status` and cumulative `output`. Completed retrieval is repeatable for the remainder of the round. Output remains bounded by existing capture and tool text limits; do not add unbounded output storage. JSON envelopes must remain parseable under those limits (budget output inside the envelope). Handles belong only to the round that launched them; unknown/expired handles and invalid argument combinations return ordinary `error:` tool text without launching anything. Do not add persistence or cross-round jobs. Commands remain ordered at launch according to existing barriers; yielding explicitly allows a command to remain alive between subsequent calls. Preserve foreign-kill refusal and process supervision. Ending a round for any reason still joins/stops its groups, including commands currently yielding or starting; a context stop is not a completed tool result.

Update README.md, docs/contract/loop-v1.md, relevant definitions/goldens and tests that currently demand command-only/unbounded foreground semantics. Keep independent lower-level sys timeout and custody contracts unchanged. No production path required by this fix is currently protected.

## Source comparison
- Addressed: original L-SHELL-HANG problem and answer 1's yielding choice map to the technical contract and yield scenario; termination at the foreground threshold is explicitly forbidden.
- Addressed: request's h04 CLI ruling maps to all four scenarios: each builds ./cmd/kogen-loop and runs its actual `run --task -` route, private HOME credentials, local fake Responses transport, fixture-model, and explicit tools [shell], thus exercising Session hooks.
- Addressed: approval constraint maps to a 12-second CLI watchdog independent of deadline_seconds (zero), with an eight-second foreground observation guard; the blocked fixture command waits for a release file supplied only after the agent receives its running result. Old behavior therefore fails without a long sleep or whole-run deadline. Build has a separate 45-second timeout and each step a 90-second limit, below Kogen's unchanged 120 seconds.
- Superseded: README and contract's no-per-call-limit foreground completion and shell definition's command-only schema are replaced only for model-facing waiting by the above yielding/retrieval contract; command execution itself has no per-call kill deadline. Existing process custody remains required.
- Addressed as historical evidence, not a benchmark obligation: request attributes the defect to loopitems-defects.md (31 Oct 2026), Studio kogen-loop/shell-call-unbounded-wait; counted/cells/kogen-shell-bound/r1/loop-default and dry/cells/kogen-shell-bound/r0/loop-default events.jsonl. Dry/r1 hit 3,600 s with passing work; shell time 3,296/3,394 s; longest calls 941/1,856 s; dry had 58 calls including acceptance runs 595/614/906/941 s. Codex took 944–1,502 s and yielding patch 741–1,167 s with calls no longer than 30 s. The executable gate reproduces the causal unbounded single wait using a release-gated foreground command rather than replaying these costly durations or claiming comparable performance. No production benchmark or guaranteed end-task speedup is added.
- Omitted intentionally: no remote research cells are required or available locally; no fix implementation was prescribed by the request. The fixed one-second threshold, same-tool retrieval and JSON shapes are settled technical choices within answer 1's within-30-seconds behavior.

## Tests
- Yield a long foreground command without killing it: add focused tools wait/result unit tests and the release-gated shipped CLI regression (regression)
- Retrieve the same running command through bounded waits then obtain its exit and cumulative output: CLI yield scenario plus focused running/completed/repeated-completed retrieval tests (integration)
- Keep fast command output and exit codes unchanged: CLI quick scenario and existing shell result tests updated only where the old unbounded promise is asserted (scenario)
- Terminate yielded groups on round end and cancellation without terminating unrelated processes: CLI finish/cancel scenarios and retain lifecycle/startup/custody tests (integration)
- Scope handles to a round and reject unknown handles or both/neither arguments without launching processes: add focused tools validation and round-transition tests (unit)
- Bound capture and preserve parseable JSON with large output: add focused running/completed output-bound tests at and around the existing limit (unit)
- Model-facing definition and default/explicit-shell wiring expose retrieval: actual CLI fixture uses tools [shell]; update definition goldens and assertions for the changed contract (scenario)

## Feasibility
- Quint model typechecked and ran 100 samples, 20 steps, seed 1, TypeScript backend with all three invariants; probe exit 0, 0.5 s. This models custody states, not scheduler timing.
- No external provider/library changes or material external protocol uncertainty: local transport uses the repository's conformance Responses SSE shapes; no documentation lookup was necessary.
- evidence: {"id":"shell-observer","kind":"observer","inputs":["features/steps/l_shell_hang.js"],"observers":["features/steps/l_shell_hang.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/l_shell_hang.js --control good","exit":0,"output":"shell-hang observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/l_shell_hang.js --control bad","exit":1,"output":"shell-hang observer rejected\n"}]}
