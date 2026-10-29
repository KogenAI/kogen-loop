Feature: Observe existing provider attempt streams without changing behavior
  Scenario Outline: Provider timing contract
    When I run stream observation test "<test>"
    Then stream observation test "<test>" passes for "<rule>"

    Examples:
      | test | rule |
      | TestStreamObsTiming | Responses and Messages headers_ms first_byte_ms ttft_ms last_byte_ms max_gap_ms gap_hist stream_bytes match scripted times within tolerance and reset per attempt |
      | TestStreamObsGaps | ordered buckets 0-1s 1-10s 10-30s 30-60s 60-120s greater-than-120s count consecutive positive reads with exact upper-inclusive boundaries |
      | TestStreamObsEndReasons | complete transport cancel budget are observed without changing results and idle is never emitted |
      | TestStreamObsNonStreaming | Chat Completions and other ReadAll paths set only headers_ms and last_byte_ms with all other new fields and ttft_ms null |
      | TestStreamObsCompatibility | request bytes existing fields observers event counts retries budgets and options are unchanged except stream ttft_ms |
