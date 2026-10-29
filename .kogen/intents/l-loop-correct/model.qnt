module model {
  var contents: int
  var before: int
  var failed: bool
  action init = all { contents' = 1, before' = 1, failed' = false }
  action step = any {
    all { before' = contents, contents' = 2, failed' = false },
    all { before' = contents, contents' = contents, failed' = true }
  }
  val Preserved = failed implies contents == before
}
