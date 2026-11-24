Feature: Refuse duplicate JSON task member names
  This feature exercises the public task decoder with raw JSON, without starting a provider.

  Scenario: Refuse two prompt members in the task object
    When task-duplicate-member-refusal: DecodeTask reads the JSON
      """
      {"prompt":"first","prompt":"last"}
      """
    Then task-duplicate-member-refusal: the decode error names "prompt"

  Scenario: Refuse a repeated model in the role object
    When task-duplicate-member-refusal: DecodeTask reads the JSON
      """
      {"role":{"model":"first","model":"last"}}
      """
    Then task-duplicate-member-refusal: the decode error names "model"

  Scenario: Refuse a repeated dir in the session object
    When task-duplicate-member-refusal: DecodeTask reads the JSON
      """
      {"session":{"dir":"first","dir":"last"}}
      """
    Then task-duplicate-member-refusal: the decode error names "dir"

  Scenario: Refuse a repeated name below an array
    When task-duplicate-member-refusal: DecodeTask reads the JSON
      """
      {"tools":[{"inner":{"label":"first","label":"last"}}]}
      """
    Then task-duplicate-member-refusal: the decode error names "label"

  Scenario: Refuse a repeated name written with a JSON escape
    When task-duplicate-member-refusal: DecodeTask reads a task with "prompt" written both plainly and with a JSON escape
    Then task-duplicate-member-refusal: the decode error names "prompt"

  Scenario: Decode a unique task with known nested fields and surrounding whitespace
    When task-duplicate-member-refusal: DecodeTask reads the JSON with surrounding whitespace
      """
      {"prompt":"hello","role":{"provider":"anthropic","model":"m","effort":"high","base_url":"http://example.test"},"session":{"dir":"/tmp/s","resume":true},"tools":["read_file","list_files"]}
      """
    Then task-duplicate-member-refusal: the decode succeeds with these task fields
      """
      {"prompt":"hello","role":{"provider":"anthropic","model":"m","effort":"high","base_url":"http://example.test"},"session":{"dir":"/tmp/s","resume":true},"tools":["read_file","list_files"]}
      """

  Scenario: Keep refusing unknown fields in the task object
    When task-duplicate-member-refusal: DecodeTask reads the JSON
      """
      {"prompt":"hello","surprise_field":1}
      """
    Then task-duplicate-member-refusal: the decode error names "surprise_field"

  Scenario Outline: Keep refusing unknown fields in nested task objects
    When task-duplicate-member-refusal: DecodeTask reads the JSON
      """
      <json>
      """
    Then task-duplicate-member-refusal: the decode error names "<key>"

    Examples:
      | json                                       | key                    |
      | {"role":{"surprise_role_field":1}}         | surprise_role_field    |
      | {"session":{"surprise_session_field":1}}  | surprise_session_field |

  Scenario: Keep refusing trailing data
    When task-duplicate-member-refusal: DecodeTask reads the JSON
      """
      {"prompt":"hello"} {}
      """
    Then task-duplicate-member-refusal: the decode error is "invalid task: trailing data after the task object"
