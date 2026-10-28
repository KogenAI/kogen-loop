module model {
  var stop: bool
  var pos: int
  var terminal: int
  var executed: Set[int]
  var skipped: Set[int]
  action init = all { stop' = true, pos' = 0, terminal' = -1, executed' = Set(), skipped' = Set() }
  action step = all {
    pos < 4,
    pos' = pos + 1,
    stop' = stop,
    terminal' = if (terminal < 0 and pos == 1) pos else terminal,
    executed' = if (terminal < 0 and pos != 1) executed.union(Set(pos)) else executed,
    skipped' = if (terminal >= 0) skipped.union(Set(pos)) else skipped
  }
  val Safe = executed.forall(i => i < 1) and skipped.forall(i => i > 1)
}
