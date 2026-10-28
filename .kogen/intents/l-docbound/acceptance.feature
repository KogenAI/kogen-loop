Feature: L-DOCBOUND documentation byte options
  Defaults remain 16384 result bytes and 8388608 body bytes; timeout remains 20 seconds.

  Scenario Outline: Documentation bounds obey the caller contract offline
    When I run documentation bound test "<test>"
    Then that documentation bound test passes without skipped coverage

    Examples:
      | test                         |
      | TestLDocboundDefaults         |
      | TestLDocboundResultBound      |
      | TestLDocboundBodyBound        |
      | TestLDocboundValidation       |
