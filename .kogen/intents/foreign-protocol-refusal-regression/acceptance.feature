Feature: Preserve coverage for task protocol refusal precedence
  These refusals already exist. The command package's offline regression tests must catch changes to either refusal.

  Scenario: A foreign protocol takes precedence over the unknown field
    When foreign-protocol-refusal-regression: I send this task to the built CLI on standard input:
      """
      {"protocol":"kogen-loop/v2","unknown_field":true}
      """
    Then foreign-protocol-refusal-regression: the CLI exits 2 before starting a session and reports this refusal:
      """
      {"reason":"unsupported_protocol","detail":"the task has protocol \"kogen-loop/v2\"; this build speaks \"kogen-loop/v1\""}
      """
    When foreign-protocol-refusal-regression: I run the package tests as written and with the wrong implementation "decode fields first"
    Then foreign-protocol-refusal-regression: the original package tests pass and a test fails with the wrong implementation

  Scenario: The supported protocol leaves the unknown field invalid
    When foreign-protocol-refusal-regression: I send this task to the built CLI on standard input:
      """
      {"protocol":"kogen-loop/v1","unknown_field":true}
      """
    Then foreign-protocol-refusal-regression: the CLI exits 2 before starting a session and reports this refusal:
      """
      {"reason":"invalid_task","detail":"invalid task: unknown field \"unknown_field\""}
      """
    When foreign-protocol-refusal-regression: I run the package tests as written and with the wrong implementation "classify field errors as unsupported protocol"
    Then foreign-protocol-refusal-regression: the original package tests pass and a test fails with the wrong implementation
