module idlestream {
  // One provider attempt in abstract ticks. First: the first-byte limit; Idle: the idle limit.
  pure val First = 2
  pure val Idle = 3
  // The watchdog's clock: ticks since dispatch or since the read it last counted as progress.
  var clock: int
  // Ghost truth: ticks since dispatch or since the last response progress actually arrived.
  var quiet: int
  // Response progress has arrived, so the idle limit applies.
  var progressed: bool
  // "open", "idle" or "complete".
  var state: str

  val limit = if (progressed) Idle else First
  // Whatever the connection sends, an open attempt never has gone without progress for its limit.
  val Bounded = state == "open" implies quiet < limit
  // An attempt ends idle only when progress has been absent for the whole limit.
  val IdleOnlyWhenSilent = state == "idle" implies quiet >= limit

  action init = all { clock' = 0, quiet' = 0, progressed' = false, state' = "open" }

  action stay = all { clock' = clock, quiet' = quiet, progressed' = progressed, state' = state }

  // kind: "progress" (a response event or a non-whitespace body byte), "keepalive" (an SSE
  // comment, a ping event, JSON whitespace), "none" (no byte) or "complete" (the terminal event).
  action tick = nondet kind = Set("progress", "keepalive", "none", "complete").oneOf() {
    if (kind == "complete") all { clock' = 0, quiet' = 0, progressed' = true, state' = "complete" }
    else if (kind == "progress") all { clock' = 0, quiet' = 0, progressed' = true, state' = "open" }
    else all {
      clock' = clock + 1,
      quiet' = quiet + 1,
      progressed' = progressed,
      state' = if (clock + 1 >= limit) "idle" else "open",
    }
  }

  action step = if (state != "open") stay else tick
}
