module anthropic_invalid_diagnostics {
  var outcome: str
  var diagnostic: str
  var count: int
  var sleeps: List[int]
  var done: bool

  pure val categories = Set("sse_error", "non_success_stop", "changed_stop_reason", "empty_result", "unsupported_block", "unsupported_delta", "ordering_or_shape", "event_after_stop", "frame_json_or_shape", "tool_input_json", "invalid_usage_shape", "invalid_block", "duplicate_tool_id")
  action init = all {
    outcome' = "ready", diagnostic' = "", count' = 0,
    sleeps' = List(), done' = false
  }
  action receive = {
    nondet input = Set("ok", "invalid", "cut", "http_transient", "context_too_long", "interrupt").oneOf()
    nondet category = categories.oneOf()
    val transient = input == "cut" or input == "http_transient"
    all {
      not(done), count < 3,
      outcome' = input,
      diagnostic' = if (input == "invalid") category else "",
      count' = count + 1,
      sleeps' = if (transient and count < 2) sleeps.append(if (count == 0) 2 else 8) else sleeps,
      done' = (not(transient) or count == 2)
    }
  }
  action stay = all {
    done, outcome' = outcome, diagnostic' = diagnostic,
    count' = count, sleeps' = sleeps, done' = done
  }
  action step = any { receive, stay }
  val Scope = and {
    (diagnostic != "") == (outcome == "invalid"),
    diagnostic == "" or categories.contains(diagnostic)
  }
  val Attempts = count >= 0 and count <= 3
  val Backoff = sleeps == List() or sleeps == List(2) or sleeps == List(2, 8)
  val Terminal = outcome == "invalid" implies done
}
