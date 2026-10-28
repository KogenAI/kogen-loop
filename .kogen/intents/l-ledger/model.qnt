module ledger {
  var kept: int
  var dropped: int
  var resetSize: int
  action init = all { kept' = 0, dropped' = 0, resetSize' = 0 }
  action read = all { kept' = if (kept < 3) kept + 1 else 3, dropped' = if (kept < 3) dropped else dropped + 1, resetSize' = resetSize }
  action reset = all { kept' = kept, dropped' = dropped, resetSize' = kept }
  action step = any { read, reset }
  val Bounded = kept >= 0 and kept <= 3 and dropped >= 0 and resetSize >= 0 and resetSize <= 3
}
