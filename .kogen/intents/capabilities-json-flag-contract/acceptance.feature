Feature: capabilities requires its documented --json flag
  This feature covers the kogen-loop capabilities command: it accepts the documented form and rejects the invocation when the json flag is absent or false.

  Background:
    Given capabilities-json-flag-contract: the kogen-loop binary is built

  Scenario: capabilities --json is accepted
    When capabilities-json-flag-contract: I run kogen-loop with arguments "capabilities --json"
    Then capabilities-json-flag-contract: it exits with code 0
    And capabilities-json-flag-contract: stdout is exactly one JSON object

  Scenario: capabilities without --json is rejected
    When capabilities-json-flag-contract: I run kogen-loop with arguments "capabilities"
    Then capabilities-json-flag-contract: it exits with code 2
    And capabilities-json-flag-contract: stdout is empty

  Scenario: capabilities --json=false is rejected
    When capabilities-json-flag-contract: I run kogen-loop with arguments "capabilities --json=false"
    Then capabilities-json-flag-contract: it exits with code 2
    And capabilities-json-flag-contract: stdout is empty
