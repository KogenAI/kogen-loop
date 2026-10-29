module streamidle {
  var elapsed: int
  var gap: int
  var seen: bool
  var ended: bool
  val Ceiling = elapsed <= 12
  val Bounds = gap <= 3
  action init = all { elapsed' = 0, gap' = 0, seen' = false, ended' = false }
  action step = if (ended) all { elapsed' = elapsed, gap' = gap, seen' = seen, ended' = ended } else nondet byte = Set(true, false).oneOf() { all { elapsed' = elapsed + 1, gap' = (if (byte) 0 else gap + 1), seen' = (seen or byte), ended' = (elapsed + 1 >= 12 or (not(byte) and gap + 1 >= (if (seen) 3 else 2))) } }
}
