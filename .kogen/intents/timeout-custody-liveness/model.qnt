module timeout_custody_liveness {
  var s: { phase: str, stop: str, interrupted: bool, error: str, published: bool, alive: bool, observed: bool, age: int }
  action init = s' = { phase: "waiting", stop: "", interrupted: false, error: "", published: false, alive: true, observed: false, age: 0 }
  action cancel = {
    nondet e = Set("context.Canceled", "context.DeadlineExceeded").oneOf()
    s' = { ...s, stop: e }
  }
  action interrupt = s' = { ...s, stop: "context.Canceled", interrupted: true }
  action observe = {
    nondet ok = Set(false, true).oneOf()
    nondet live = Set(false, true).oneOf()
    s' = { ...s, observed: ok, alive: live }
  }
  action dispatch = s' = if (s.stop != "")
    { ...s, phase: "stopped", error: if (s.interrupted) "interrupted" else s.stop, age: s.age + 1 }
    else if (s.observed and not(s.alive)) { ...s, phase: "feedback", published: true }
    else s
  action stay = s' = s
  action step = if (s.phase != "waiting") stay
    else if (s.stop != "") dispatch
    else any { cancel, interrupt, observe, dispatch }
  action mutantDispatch = s' = { ...s, age: s.age + 1 }
  action mutantStep = if (s.phase != "waiting") stay
    else if (s.stop != "") mutantDispatch
    else any { cancel, interrupt, observe, dispatch }
  val Truthful = s.published implies s.observed
  val StopWins = s.stop != "" implies not(s.published)
  val Custody = s.published implies not(s.alive)
  val Progress = s.stop != "" implies (s.age <= 1 and (s.age == 0 or s.phase == "stopped"))
  val Precedence = s.phase == "stopped" implies s.error == (if (s.interrupted) "interrupted" else s.stop)
}
