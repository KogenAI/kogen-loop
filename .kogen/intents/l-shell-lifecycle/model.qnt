module lifecycle {
  var pending: bool
  var live: bool
  var stopping: bool
  var returned: bool
  val Safe = not(returned) or (not(pending) and not(live))
  action init = all { pending' = false, live' = false, stopping' = false, returned' = false }
  action step = any {
    all { not(stopping), not(returned), not(pending), not(live), pending' = true, live' = live, stopping' = stopping, returned' = returned },
    all { pending, pending' = false, live' = not(stopping), stopping' = stopping, returned' = returned },
    all { not(returned), stopping' = true, pending' = pending, live' = live, returned' = returned },
    all { stopping, live' = false, pending' = pending, stopping' = stopping, returned' = returned },
    all { stopping, not(pending), not(live), returned' = true, pending' = pending, live' = live, stopping' = stopping }
  }
}
