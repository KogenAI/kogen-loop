module model {
  var phase: str
  var running: bool
  var yielded: bool
  action init = all { phase' = "round", running' = false, yielded' = false }
  action start = all { phase == "round", not(running), running' = true, phase' = phase, yielded' = false }
  action yieldShell = all { phase == "round", running, yielded' = true, running' = running, phase' = phase }
  action retrieve = all { phase == "round", yielded, running' = running, yielded' = yielded, phase' = phase }
  action finishCommand = all { phase == "round", running, running' = false, phase' = phase, yielded' = yielded }
  action endRound = all { phase == "round", phase' = "cleanup", running' = running, yielded' = yielded }
  action stop = all { phase == "cleanup", running' = false, phase' = phase, yielded' = yielded }
  action returnControl = all { phase == "cleanup", not(running), phase' = "returned", running' = running, yielded' = false }
  action idle = all { phase == "returned", phase' = phase, running' = running, yielded' = yielded }
  action step = any { start, yieldShell, retrieve, finishCommand, endRound, stop, returnControl, idle }
  val StableReturn = phase != "returned" or not(running)
}
