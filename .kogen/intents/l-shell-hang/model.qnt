module shell_hang {
  var phase: str
  var alive: bool
  var returned: bool
  action init = all { phase' = "idle", alive' = false, returned' = false }
  action start = all { phase == "idle", phase' = "running", alive' = true, returned' = false }
  action yield = all { phase == "running", phase' = "yielded", alive' = true, returned' = true }
  action poll = all { phase == "yielded", phase' = phase, alive' = alive, returned' = true }
  action complete = all { phase == "yielded", phase' = "completed", alive' = false, returned' = true }
  action end = all { phase != "idle", phase' = "ended", alive' = false, returned' = returned }
  action step = any { start, yield, poll, complete, end }
  val YieldKeepsAlive = phase == "yielded" implies (alive and returned)
  val EndStops = phase == "ended" implies not(alive)
  val CompletedStops = phase == "completed" implies (not(alive) and returned)
}
