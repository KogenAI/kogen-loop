module retire_batch {
  var cancelled: Set[int]
  var ended: Set[int]
  var retry: bool
  val Safe = not(retry) or ended == Set(1, 2, 3)
  val Scoped = cancelled.subseteq(Set(1, 2, 3))
  action init = all { cancelled' = Set(), ended' = Set(), retry' = false }
  action step = any {
    all { cancelled' = Set(1, 2, 3), ended' = ended, retry' = retry },
    all { cancelled == Set(1, 2, 3), ended' = Set(1, 2, 3), cancelled' = cancelled, retry' = retry },
    all { ended == Set(1, 2, 3), retry' = true, cancelled' = cancelled, ended' = ended }
  }
}
