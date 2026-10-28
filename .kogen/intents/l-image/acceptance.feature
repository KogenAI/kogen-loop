Feature: L-IMAGE library-only image tool omission
  Scenario Outline: Enforce the image omission contract through the public Go API
    When I run the L-IMAGE Go test "<test>"
    Then the L-IMAGE Go test "<test>" ran and passed

    Examples:
      | test                      |
      | TestLImageDefinitions     |
      | TestLImageRefusal          |
      | TestLImageDefaults         |
      | TestLImagePackageDefaults  |
