Feature: Optional one-hour Anthropic cache breakpoints
  Default requests remain byte-identical and non-Anthropic routes stay unchanged.
  All transport tests use a local fake server, never paid provider calls.

  Scenario Outline: Enforce the complete TTL contract
    When I run the breakpoint TTL tests
    Then breakpoint TTL test "<test>" must pass for "<behavior>"

    Examples:
      | test | behavior |
      | TestBreakpointTTLDefault | absent TTL preserves the pre-change Anthropic request byte golden and null configured_ttl |
      | TestBreakpointTTLHour | 1h sets all three cache_control objects to ephemeral ttl 1h and configured_ttl to 1h; applied_ttl stays null; headers unchanged |
      | TestBreakpointTTLAuthority | 1h also applies to the optional fourth authority marker without moving markers or mutating input |
      | TestBreakpointTTLInvalid | 5m and 2h are refused by Render and Respond with provider/invalid_request naming AnthropicCacheTTL before HTTP |
      | TestBreakpointTTLIsolation | non-Anthropic bodies and diagnostics are unchanged for absent, 1h and invalid Anthropic TTL values |
      | TestBreakpointTTLContract | docs/contract/loop-v1.md documents AnthropicCacheTTL, empty default, 1h and provider-only scope |
