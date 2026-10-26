module standalone_loop {
  var phase: str
  var batch: List[bool]
  var cursor: int
  var last: int
  var outputs: Set[int]
  var terminalIds: Set[int]
  var ended: str

  action init = all {
    phase' = "request", batch' = [], cursor' = 0, last' = -1,
    outputs' = Set(), terminalIds' = Set(), ended' = ""
  }
  action respond = {
    nondet b = Set([], [false], [true], [false, true, false], [true, false, true]).oneOf()
    all {
      phase == "request",
      batch' = b, cursor' = 0, last' = -1, outputs' = Set(), terminalIds' = Set(),
      phase' = if (b.length() == 0) "ended" else "calls",
      ended' = if (b.length() == 0) "no_call" else ""
    }
  }
  action call = all {
    phase == "calls", cursor < batch.length(),
    phase' = phase, batch' = batch, cursor' = cursor + 1,
    last' = if (batch[cursor]) cursor else last,
    terminalIds' = if (batch[cursor]) terminalIds.union(Set(cursor)) else terminalIds,
    outputs' = if (batch[cursor]) outputs else outputs.union(Set(cursor)),
    ended' = ended
  }
  action finishBatch = all {
    phase == "calls", cursor == batch.length(),
    phase' = if (last >= 0) "ended" else "request",
    ended' = if (last >= 0) "terminal" else "",
    batch' = batch, cursor' = cursor, last' = last,
    outputs' = outputs, terminalIds' = terminalIds
  }
  action cancel = all {
    phase != "ended", phase != "cancelled", phase' = "cancelled", ended' = "",
    batch' = batch, cursor' = cursor, last' = last,
    outputs' = outputs, terminalIds' = terminalIds
  }
  action stay = all {
    or { phase == "ended", phase == "cancelled" },
    phase' = phase, batch' = batch, cursor' = cursor, last' = last,
    outputs' = outputs, terminalIds' = terminalIds, ended' = ended
  }
  action step = any { respond, call, finishBatch, cancel, stay }
  val NoTerminalOutput = outputs.intersect(terminalIds) == Set()
  val LastWins = terminalIds.forall(i => i <= last)
  val HonestEnding = and {
    ended == "terminal" implies (phase == "ended" and last >= 0 and cursor == batch.length()),
    ended == "no_call" implies (phase == "ended" and batch.length() == 0),
    phase == "cancelled" implies ended == ""
  }
}
