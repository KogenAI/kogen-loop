Feature: Linux flakes in kogen-loop tests are fixed by waiting on events

  Scenario: the open-socket provider test is event driven and stable
    Given the open-socket provider test and the custody observation test
    Then the open-socket test waits for the open and closed events without a two second timer
    And both tests still assert their original outcomes
    When I run "TestEmptyTerminalMetadataKeepsOrderedItemsOnAnOpenSocket" fifty times with GOMAXPROCS 2 in package "./provider"
    Then the go test run passes

  Scenario: the custody test shares one fixture build and is stable
    Given the open-socket provider test and the custody observation test
    Then the custody fixture binary is built once per test binary with no build deadline
    When I run "TestTimeoutCustodyBlockedObservation" fifty times with GOMAXPROCS 2 in package "./sys"
    Then the go test run passes
