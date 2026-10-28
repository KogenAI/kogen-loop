Feature: Caller-supplied session cache identity
  Scenario Outline: Preserve cache identity selection and wire compatibility
    When I run session cache identity case "<case>"
    Then session cache identity case "<case>" passes without skipping

    Examples:
      | case                  |
      | shared_key            |
      | empty_compatibility   |
      | resume_selection      |
      | request_compatibility |
