module model {
  var active: bool
  var seen: bool
  var previous: int
  var events: int
  val Released = active or (not(seen) and previous == 0)
  val Bounded = previous >= 0 and previous <= 524288
  action init = all { active' = false, seen' = false, previous' = 0, events' = 0 }
  action step = any {
    all { active' = true, seen' = true, previous' = 10241, events' = events + 1 },
    all { active' = false, seen' = false, previous' = 0, events' = events },
    all { active' = active, seen' = seen, previous' = previous, events' = events }
  }
}
