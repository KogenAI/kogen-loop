module model {
  var ready: Set[int]
  var active: Set[int]
  var done: Set[int]
  var published: bool
  var failed: bool
  var conflict: bool
  action init = all { ready' = Set(), active' = Set(), done' = Set(), published' = false, failed' = false, conflict' = true }
  action complete = { nondet i = Set(0, 1).oneOf(); all { not(failed), not(published), ready' = ready.union(Set(i)), active' = active, done' = done, published' = published, failed' = failed, conflict' = conflict } }
  action start = { nondet i = Set(0, 1).oneOf(); all { ready.contains(i), not(failed), not(published), not(done.contains(i)), (i == 0 or not(conflict) or done.contains(0)), active' = active.union(Set(i)), ready' = ready, done' = done, published' = published, failed' = failed, conflict' = conflict } }
  action finish = { nondet i = Set(0, 1).oneOf(); all { active.contains(i), active' = active.exclude(Set(i)), done' = done.union(Set(i)), ready' = ready, published' = published, failed' = failed, conflict' = conflict } }
  action abort = all { active' = Set(), done' = Set(), published' = false, failed' = true, ready' = ready, conflict' = conflict }
  action publish = all { not(failed), done == Set(0, 1), active == Set(), published' = true, ready' = ready, active' = active, done' = done, failed' = failed, conflict' = conflict }
  action independent = all { ready == Set(), active == Set(), done == Set(), not(failed), not(published), conflict' = false, ready' = ready, active' = active, done' = done, published' = published, failed' = failed }
  action step = any { complete, start, finish, abort, publish, independent }
  val Safe = all { active.subseteq(ready), published implies (not(failed) and done == Set(0, 1)), failed implies (active == Set() and done == Set() and not(published)), (conflict and active.contains(1)) implies done.contains(0) }
}
