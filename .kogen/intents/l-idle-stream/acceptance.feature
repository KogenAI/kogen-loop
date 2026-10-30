Feature: An attempt without response progress ends at the existing silence limits

  Scenario Outline: Idle stream regression through Client.Respond and loop.Session
    When I run idle stream test "<test>" in package "<package>"
    Then idle stream test "<test>" in package "<package>" passes for "<rule>"

    Examples:
      | test                       | package     | rule |
      | TestIdleStreamSilentServer | provider    | a local HTTP server that stops sending while the connection stays open ends the attempt as failed with end_reason idle at 90 s (ChatGPT) or 45 s (Anthropic) without first progress, or 180 s after the last progress on Responses, Messages and non-streaming Chat Completions; last_byte_ms and last_progress_ms show the last byte; the 2 s retry answers |
      | TestIdleStreamKeepAlive    | provider    | SSE comment lines, Anthropic ping events and JSON whitespace are keep-alives: they neither count as the first byte nor renew the 180 s idle clock, so an attempt sending only keep-alives ends idle while last_byte_ms is later than last_progress_ms |
      | TestIdleStreamProgress     | provider    | a progress event completed 1 ms before the limit renews it and one at the limit is too late; a partial event renews only when its blank line arrives; an 800 s stream with progress gaps under 180 s and keep-alives between completes with end_reason complete |
      | TestIdleStreamRunLog       | conformance | through loop.Session the request.attempt event of the stalled attempt carries outcome failed, end_reason idle, last_byte_ms and last_progress_ms, the retry's request.attempt is completed and the round ends |
