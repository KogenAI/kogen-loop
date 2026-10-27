module caller_shell_bound {
  var phase: str
  var bounded: bool
  var expired: bool
  var cancelled: bool
  var alive: bool
  var published: str
  var completed: int

  action init = all {
    phase' = "idle", bounded' = false, expired' = false,
    cancelled' = false, alive' = false, published' = "", completed' = 0
  }
  action start = {
    nondet b = Set(false, true).oneOf()
    all {
      phase == "idle", not(cancelled), completed < 2,
      phase' = "running", bounded' = b, expired' = false,
      cancelled' = false, alive' = true, published' = "", completed' = completed
    }
  }
  action finish = all {
    phase == "running", not(cancelled),
    phase' = "ready", alive' = false,
    bounded' = bounded, expired' = expired, cancelled' = cancelled,
    published' = published, completed' = completed
  }
  action expire = all {
    phase == "running", bounded, not(cancelled),
    phase' = "cleanup", expired' = true,
    bounded' = bounded, cancelled' = cancelled, alive' = alive,
    published' = published, completed' = completed
  }
  action cancel = all {
    phase != "stopped", published == "",
    phase' = if (alive) "cleanup" else "stopped", cancelled' = true,
    bounded' = bounded, expired' = expired, alive' = alive,
    published' = "", completed' = completed
  }
  action reap = all {
    phase == "cleanup",
    phase' = if (cancelled) "stopped" else "ready", alive' = false,
    bounded' = bounded, expired' = expired, cancelled' = cancelled,
    published' = published, completed' = completed
  }
  action publish = all {
    phase == "ready", not(cancelled), not(alive),
    phase' = "published", published' = if (expired) "timeout" else "ordinary",
    bounded' = bounded, expired' = expired, cancelled' = cancelled, alive' = alive,
    completed' = completed + 1
  }
  action advance = all {
    phase == "published", completed < 2,
    phase' = "idle", published' = "",
    bounded' = bounded, expired' = false, cancelled' = cancelled,
    alive' = alive, completed' = completed
  }
  action stay = all {
    or { phase == "stopped", phase == "published" },
    phase' = phase, bounded' = bounded, expired' = expired,
    cancelled' = cancelled, alive' = alive, published' = published, completed' = completed
  }
  action step = any { start, finish, expire, cancel, reap, publish, advance, stay }
  val Truthful = and {
    published == "timeout" implies (bounded and expired),
    published == "ordinary" implies not(expired)
  }
  val StopWins = cancelled implies published == ""
  val Custody = published != "" implies not(alive)
}
