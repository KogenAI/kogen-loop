Feature: L-READ-CONTAIN confines caller-named reads
  Scenario Outline: Contain reads without breaking authorized sources
    When I run root-read contract test "<test>"
    Then root-read contract test "<test>" passes
    Examples:
      | test                           |
      | TestReadContainFaults          |
      | TestReadContainSymlinkEscapes  |
      | TestReadContainInside          |
      | TestReadContainOtherTools      |
