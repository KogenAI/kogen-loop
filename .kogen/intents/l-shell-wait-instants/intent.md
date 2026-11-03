# Record the instants of each shell wait

Slug: l-shell-wait-instants
Model: not applicable — the record observes the wait of one shell call as it happens; the shell call's states (started, running, yielded, retrieved, completed, cancelled), its handles, its waits and round cleanup are unchanged, and nothing new is stored or carried between calls beyond the command's own start instant
Acceptance:
- .kogen/intents/l-shell-wait-instants/acceptance.feature
- features/steps/l_shell_wait_instants.js
- features/steps/l_shell_wait_instants_driver.go

L-SHELL-WAIT-INSTANTS (research shelf batch 3, Nov 2026; repository kogen-loop). Today the time of a shell call can be read from its events only at one-second resolution, between its `tool.call` and its `tool.result`. Nothing records when the command's process started, when the bounded wait started or ended, or why it ended. So a shell turn's wall time cannot be split into spawn latency, the bounded wait (45 s for a new command, 30 s for a retrieval with a handle) and host stall.

After this change, the `tool.result` event of every shell call that reaches its bounded wait carries one more field, `shell_wait`, a JSON object with exactly these four keys:
- `spawned`: the instant the command's process started, or JSON `null` when no process had started by the time the wait ended. That covers a refused command, a command that failed to start, and one still starting when the wait ended. A retrieval reports its command's start instant, the same value the starting call reported, or `null` while that process has still not started.
- `wait_started`: the instant this call's bounded wait started, that is, when its 45-second or 30-second timer was started (or `ShellAfter` was asked for it).
- `wait_ended`: the instant the wait ended: the command ended, the bound elapsed, or the context was done.
- `ended_by`: why the wait ended, one string from this fixed vocabulary:
  - `exit`: the call returns a completed result. That is an `exit status: N` text, the completed envelope of a retrieval, or the foreign-kill refusal. It also covers a command whose run ended during the wait, including one that was refused or could not start.
  - `handle_yielded`: a new command's 45-second bound elapsed while the command was still running, and the call yields a new handle (`status: "running"`).
  - `bound`: a retrieval's 30-second bound elapsed while the command was still running, and the call returns `status: "running"` with the same handle.
  - When the command's completion and the elapsed bound are both ready, `ended_by` follows the result the call returns: a completed result is `exit`.

The instants:
- Each instant is a string in RFC 3339 UTC with exactly nine fractional digits, Go layout `2006-01-02T15:04:05.000000000Z07:00` applied to `t.UTC()`, for example `2026-11-03T08:50:49.123456000Z`.
- They are wall-clock instants of the kogen-loop process, so they compare with the event `time` and with host logs.
- `spawned` is taken when `exec.Cmd.Start` has returned successfully, at the point where the process group becomes known today (the `started` callback of `sys` `runCaptured`). Reading it must be race-free under `go test -race`.

Which calls carry the record:
- Only shell calls that reach the wait carry `shell_wait`.
- A malformed shell call has no wait, so no record: missing, wrong-type or conflicting `command`/`handle`, with `malformed_class` as today.
- An unknown or expired handle (`error_kind: unknown_shell_handle`) has no record, nor does a call whose context is already done.
- A call stopped by cancellation, a deadline or an interrupt has no `tool.result` today and still has none.
- Every non-shell `tool.result` has no `shell_wait`.
- The foreign-kill refusal keeps `rule` and `error_kind: foreign_kill` beside `shell_wait`.
- `tool.call` events are unchanged: `call_id`, `name`, `arguments_sha256`.

Interfaces:
- `tools.Classified` gains `ShellWait *ShellWait`, nil for every call that did not reach a shell wait. The new exported type is:
  ```go
  // ShellWait is the bounded wait of one shell call.
  type ShellWait struct {
      Spawned     time.Time // zero: no process had started when the wait ended
      WaitStarted time.Time
      WaitEnded   time.Time
      EndedBy     string // api.ShellWaitExit, api.ShellWaitBound or api.ShellWaitHandleYielded
  }
  ```
  `Tools.RunClassified` and `CallClassified` return it. `Classified.Output()`, `RunContext`, `Run`, `Call` and `CallContext` are unchanged, so library hosts that call `CallClassified` in their `HandleCall` hook get the same record.
- `api/api.go` exports `ShellWaitExit = "exit"`, `ShellWaitBound = "bound"` and `ShellWaitHandleYielded = "handle_yielded"` beside the tool error kinds.
- How `tools` learns the spawn instant from `sys.CapturedCommand` is the Build's choice, for example an accessor on `CapturedCommand`. It must add no option, setting or environment variable.
- `loop.Session` (and so `kogen-loop run`) writes `Classified.ShellWait` into the call's `tool.result` as `shell_wait`, with `spawned` `null` for a zero `Spawned`.
- `docs/contract/loop-v1.md` updates the `tool.result` row of the events table and adds a short note to "Shell time limit" with the four keys, the format and the vocabulary. The contract's rule for an additive v1 event field asks for this note and a conformance fixture.

Unchanged and out of scope:
- The 45-second and 30-second waits.
- Everything the model receives: tool texts, envelopes, the cut, definitions, request bodies and the transcript.
- `Tools.ShellAfter`, `sys.Options.Timeout`, round cleanup, the other events and their `time` field.
- Capabilities and `capabilities_digest`, CLI commands and flags, task fields and `SessionConfig`.
- `loop.Run`, which emits no events.
- `provider/`.
- Kogen's own run logs, its vendored copy and its pin, which pick this up only when Kogen updates them.
- CHANGELOG.md: commit history records changes.

## Decisions
- Per shell call, record the instants of spawn, wait start and wait end, and the reason the wait ended (exit, bound, handle yielded), with the existing tool-call record (source: request)
- The record goes on the call's `tool.result` event, the tool-call record written after the call ran, and the same values are returned to library hosts as `tools.Classified.ShellWait` (source: request)
- Only missing timestamps are added. The shaping check of 2fc1eb7 (X-L1) found that none of the four exists, so all four are added (source: request)
- The change stays in the shell wait path and the record shape and does not touch `provider/` (source: request)

## Source comparison
- Addressed, the X-L1 gate ("first checks which timestamps already exist at 2fc1eb7 so only missing ones are requested"). At 2fc1eb7 (production code identical at HEAD 7aebcbf, which only changes `.kogen/project.yaml`):
  - The only timestamp is the `time` of every event, `time.Now().UTC().Format(time.RFC3339)` in `loop/session.go` `emit`, which is whole seconds. `tool.call` is stamped before the call runs and `tool.result` after it returns.
  - The shell path (`tools/tools.go` `shell`, `sys` `StartCaptured`/`runCaptured`) reads no clock except the wait's timer. The `[debug] command in ...` line has no time.
  - So spawn, wait start, wait end and the reason are all missing. All four are added, and `time` stays as it is.
- Addressed, Need "instants of spawn, wait start, wait end": `spawned`, `wait_started`, `wait_ended`.
  - The CLI scenario checks the format, that each instant lies within the run and between its `tool.call` and `tool.result` seconds, and that the `sleep 0.3` command's wait ends at least 300 ms after its spawn and its wait start.
  - The driver scenario checks each wait against the driver's own instants: the call's start and end, when `ShellAfter` fired, and when the command was released.
- Addressed, Need "the reason the wait ended (exit, bound, handle yielded)": `ended_by` is `exit`, `bound` or `handle_yielded`, with the meaning decided above.
  - The driver covers all three on controlled time: a new command that yields, a retrieval that reaches its bound, a retrieval that completes on release, a repeated completed retrieval, a fast exit and a refusal.
  - The request leaves open how "bound" and "handle yielded" differ. Decided here: `handle_yielded` is a new command's elapsed 45-second bound, which issues a handle; `bound` is a retrieval's elapsed 30-second bound. That way the event log, whose arguments are only hashed, still tells which bound ended a wait.
- Addressed, Need "Recorded with the existing tool-call record": the `tool.result` event. `tool.call` is written before the call runs, and the acceptance requires it unchanged.
- Addressed, Problem: with the four values, a turn's tool phase splits into the spawn (`spawned` − `wait_started`), the wait (`wait_ended` − `wait_started`) and the rest of the call around them.
- Addressed, Independence ("tools/ (shell wait path) + the tool-call record shape; not provider/"):
  - Changes are `tools/` and the record (`loop/session.go`, `api` constants, contract note), plus the smallest `sys` addition that exposes the start instant.
  - That instant exists only inside `sys` `runCaptured`, where `cmd.Start` returns. `provider/` is untouched.
- Evidence, `tools/tools.go:678-684` at 2fc1eb7 (`wait := 45 * time.Second`, 30 s with a handle, `ShellAfter` seam): confirmed in this checkout. The waits are unchanged.
- Evidence, the L1 fixture `climb/loop/cl3_turn_bound_test.go.txt`, the 118 shell turns in 13 Studio logs (29 over 45 s, 37 over 30 s, 8 with a tool phase over 47.5 s, max 54.4 s; the 408 s turn and the 442/370 s stalls) and `climb/loop/LANE.md` climb-loop-3: not present in this checkout. They are motivation, not thresholds, and are not reproduced here.
- Omitted, separate: placing the 408 s turn or the stalls, and changing Kogen's own logs, vendored copy or pin.

## Tests
- A shell call that reaches its wait returns `Classified.ShellWait` with `ended_by` `handle_yielded` (new command, 45 s elapsed), `bound` (retrieval, 30 s elapsed) or `exit` (fast exit, completion on release, repeated completed retrieval, foreign-kill refusal), a retrieval repeating its command's `Spawned`, a refusal with zero `Spawned`, and instants within the call at the instant that ended the wait: acceptance scenario `tools.Tools records why each shell wait ended, on controlled time`, plus a new `tools` test on the existing `shellClock` helpers (`tools/shell_after_test.go`) checking the same endings (integration)
- Calls that do not reach the wait (malformed shell calls, unknown handles, non-shell tools) have nil `ShellWait` and no `shell_wait`: both acceptance scenarios, plus the same new `tools` test for the unknown handle and the malformed call (integration)
- `kogen-loop run` writes `shell_wait` with exactly the four keys and nine-digit RFC 3339 UTC instants on the `tool.result` of each shell call that reached its wait, `spawned` `null` on a refusal, keeps `rule` and `error_kind`, leaves `tool.call` and every model output unchanged: acceptance scenario `The CLI's tool.result events carry the shell wait of each shell call that reached it`, plus a new conformance test that runs a `loop.Session` with the existing fake provider (as `conformance/foreign_kill_event_test.go` does) checking `shell_wait` on an exit and a refusal and its absence on a read and a malformed shell call, the conformance fixture the contract asks of an additive event field (integration)
- The Session event carries `handle_yielded` and `bound` from the yield path, not only `exit`: a new `loop` package test that sets the session's `tools.ShellAfter` and checks `ended_by` and `spawned` of a yielding command and its bound-reaching retrieval in the emitted `tool.result` events (integration)
- The waits, envelopes, texts, cut, cancellation, round cleanup and other events keep their behavior: the existing `go test -race ./...` suites, including the l-shell-wait-seam tests, keep passing unchanged (existing)

## Feasibility
- Repository inspection:
  - The wait is chosen and run only in `(*Tools).shell` (`tools/tools.go`).
  - The process starts in a goroutine in `sys` `StartCaptured` → `runCaptured`, so the start can land just before or after the wait starts. `spawned` and `wait_started` are therefore not ordered against each other, and the acceptance does not order them.
  - `tool.result` is built in `loop/session.go` `AfterCall` from what `HandleCall` learned through `CallClassified`.
  - No external protocol, library or provider is involved, so no documentation lookup was needed.
- Scratch reference implementation, outside the checkout (a `git archive` copy of HEAD):
  - It added the `api` constants, a `CapturedCommand.Started()` accessor under the session mutex set in the `started` callback, `Classified.ShellWait` set after the wait's select, and the `shell_wait` map in `loop/session.go`.
  - `go build ./...`, `gofmt -l .` and `go vet` were clean, and `go test -race -count=1 ./tools ./loop ./api ./contract ./conformance` passed.
  - The submitted acceptance passed both scenarios 6 times in a row, about 5 s each, including the CLI build.
- The unchanged tree fails both scenarios for the missing feature only:
  - The CLI observation lacks `shell_wait`; every other field and output matches.
  - The driver does not compile: `got.ShellWait undefined (type tools.Classified has no field or method ShellWait)`.
- The driver (`features/steps/l_shell_wait_instants_driver.go`, `//go:build ignore`) is outside `go vet ./...` and `go build ./...`, and it is gofmt-clean. It runs as `go run features/steps/l_shell_wait_instants_driver.go` from the repository root, like `features/steps/loop_driver.go`.
- evidence: {"id":"shell-wait-instants-observer","kind":"observer","inputs":["features/steps/l_shell_wait_instants.js"],"observers":["features/steps/l_shell_wait_instants.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/l_shell_wait_instants.js --control good","exit":0,"output":"shell wait instants observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/l_shell_wait_instants.js --control bad","exit":1,"output":"shell wait instants observer rejected\n"}]}
