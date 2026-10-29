Feature: Compatible saved keys belong only to their login origin
  Scenario Outline: Enforce credential custody through the real provider boundary
    When I run compatible origin regression "<test>"
    Then compatible origin regression must run and pass
    Examples:
      | test                      |
      | TestLCredOriginLogin      |
      | TestLCredOriginMismatch   |
      | TestLCredOriginMatch      |
      | TestLCredOriginLegacy     |
      | TestLCredOriginPlaintext  |
