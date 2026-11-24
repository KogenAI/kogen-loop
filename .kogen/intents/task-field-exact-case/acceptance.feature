Feature: Enforce the exact spelling of JSON task fields

  Scenario: Refuse a case variant at the task root
    When task-field-exact-case: the caller decodes this JSON task
      """
      {"Prompt":"hello","role":{"model":"first","model":"last"}}
      """
    Then task-field-exact-case: duplicate detection still reports "model" before checking field spelling
    When task-field-exact-case: the caller decodes this JSON task
      """
      {"Prompt":"hello"}
      """
    Then task-field-exact-case: decoding fails and names "Prompt"

  Scenario: Refuse a case variant in role
    When task-field-exact-case: the caller runs the CLI with this JSON task on standard input
      """
      {"protocol":"kogen-loop/v1","root":".","prompt":"hello","deadline_seconds":-1}
      """
    Then task-field-exact-case: the CLI exits 2 and reports invalid_task with detail "deadline_seconds must not be negative"
    When task-field-exact-case: the caller decodes this JSON task
      """
      {"prompt":"hello","role":{"Model":"m"}}
      """
    Then task-field-exact-case: decoding fails and names "Model"

  Scenario: Decode exact names but refuse a case variant in session
    When task-field-exact-case: the caller decodes this JSON task
      """
      {"prompt":"hello","role":{"provider":"anthropic","model":"m","effort":"high","base_url":"http://example.test"},"session":{"dir":"/tmp/s","resume":true},"tools":["read_file","list_files"]}
      """
    Then task-field-exact-case: decoding preserves those field values without an error
    When task-field-exact-case: the caller decodes this JSON task
      """
      {"prompt":"hello","session":{"Dir":"/tmp/s"}}
      """
    Then task-field-exact-case: decoding fails and names "Dir"

  Scenario: Publish the exact field spelling rule
    Then task-field-exact-case: the caller contract requires exact JSON task field names in the task, role and session objects
