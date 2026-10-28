module nudge {
  var remaining: int
  var ended: bool
  var terminal: bool
  var used: int
  val bounded = remaining >= 0 and used >= 0 and used + remaining == 2
  val terminalEnds = not(terminal) or ended
  action init = all { remaining' = 2, used' = 0, ended' = false, terminal' = false }
  action step = any {
    all { ended, remaining' = remaining, used' = used, ended' = ended, terminal' = terminal },
    all {
      not(ended),
      any {
        all { remaining > 0, remaining' = remaining - 1, used' = used + 1, ended' = false, terminal' = false },
        all { remaining == 0, remaining' = remaining, used' = used, ended' = true, terminal' = false },
        all { remaining' = remaining, used' = used, ended' = true, terminal' = true },
        all { remaining' = remaining, used' = used, ended' = false, terminal' = false }
      }
    }
  }
}
