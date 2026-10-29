Feature: Default first-byte and idle attempt timeouts
  Scenario Outline: Enforce timeouts through real Respond behavior
    When I run stream idle test "<test>"
    Then stream idle test "<test>" passes for "<rule>"

    Examples:
      | test | rule |
      | TestStreamIdleFirstByte | ChatGPT 90 s and Anthropic/other 45 s before first byte; all headers bounded; transient idle attempt retries |
      | TestStreamIdleGap | silence at 180 s fails idle and retries; bytes before 180 s renew idle, not zero reads |
      | TestStreamIdleLongStream | 800 s of simulated byte progress completes on both streaming wires |
      | TestStreamIdleAbsoluteBudget | absolute ceiling wins over streaming progress and retries without renewal |
      | TestStreamIdleCompatibility | identical request bytes, unchanged retries and backoff, Single, no public knob |
      | TestStreamIdleBlocked | blocked headers and body reads terminate without another byte and clean up resources |
