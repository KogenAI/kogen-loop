Feature: A refused run says what is wrong with the invocation or the task input

  This feature covers the detail of the invalid_task error event when kogen-loop run refuses before reading a task, and when the task input is empty. Every refusal exits 2 and ends the session as failed without starting one.

  Scenario: No task argument
    Given kogen-loop-run-refusals-name-the-fault: the CLI is built from this checkout
    When kogen-loop-run-refusals-name-the-fault: I run the CLI with this invocation:
      """
      {"args": ["run"], "stdin": ""}
      """
    Then kogen-loop-run-refusals-name-the-fault: the run refusal has detail 'run needs --task FILE|- (a task file, or - for standard input)'

  Scenario: Empty task value
    Given kogen-loop-run-refusals-name-the-fault: the CLI is built from this checkout
    When kogen-loop-run-refusals-name-the-fault: I run the CLI with this invocation:
      """
      {"args": ["run", "--task", ""], "stdin": ""}
      """
    Then kogen-loop-run-refusals-name-the-fault: the run refusal has detail 'run needs --task FILE|- (a task file, or - for standard input)'

  Scenario: An extra argument
    Given kogen-loop-run-refusals-name-the-fault: the CLI is built from this checkout
    When kogen-loop-run-refusals-name-the-fault: I run the CLI with this invocation:
      """
      {"args": ["run", "--task", "-", "extra"], "stdin": "{\"protocol\":\"kogen-loop/v1\",\"root\":\"/tmp\",\"prompt\":\"hello\"}"}
      """
    Then kogen-loop-run-refusals-name-the-fault: the run refusal has detail 'run takes no argument besides --task, got "extra"'

  Scenario: Unknown flag
    Given kogen-loop-run-refusals-name-the-fault: the CLI is built from this checkout
    When kogen-loop-run-refusals-name-the-fault: I run the CLI with this invocation:
      """
      {"args": ["run", "--bogus"], "stdin": ""}
      """
    Then kogen-loop-run-refusals-name-the-fault: the run refusal has detail 'flag provided but not defined: -bogus'

  Scenario: Flag without a value
    Given kogen-loop-run-refusals-name-the-fault: the CLI is built from this checkout
    When kogen-loop-run-refusals-name-the-fault: I run the CLI with this invocation:
      """
      {"args": ["run", "--task"], "stdin": ""}
      """
    Then kogen-loop-run-refusals-name-the-fault: the run refusal has detail 'flag needs an argument: -task'

  Scenario: Empty standard input
    Given kogen-loop-run-refusals-name-the-fault: the CLI is built from this checkout
    When kogen-loop-run-refusals-name-the-fault: I run the CLI with this invocation:
      """
      {"args": ["run", "--task", "-"], "stdin": ""}
      """
    Then kogen-loop-run-refusals-name-the-fault: the run refusal has detail 'the task read from standard input is empty'

  Scenario: Whitespace-only standard input
    Given kogen-loop-run-refusals-name-the-fault: the CLI is built from this checkout
    When kogen-loop-run-refusals-name-the-fault: I run the CLI with this invocation:
      """
      {"args": ["run", "--task", "-"], "stdin": "\n  \t\n"}
      """
    Then kogen-loop-run-refusals-name-the-fault: the run refusal has detail 'the task read from standard input is empty'

  Scenario: Non-JSON standard input
    Given kogen-loop-run-refusals-name-the-fault: the CLI is built from this checkout
    When kogen-loop-run-refusals-name-the-fault: I run the CLI with this invocation:
      """
      {"args": ["run", "--task", "-"], "stdin": "this is x\n"}
      """
    Then kogen-loop-run-refusals-name-the-fault: the run refusal has detail 'invalid task: expected one JSON object'

  Scenario: Empty task file
    Given kogen-loop-run-refusals-name-the-fault: the CLI is built from this checkout
    When kogen-loop-run-refusals-name-the-fault: I run the CLI with this invocation:
      """
      {"args": ["run", "--task", "empty-task.json"], "stdin": "", "files": {"empty-task.json": "\n"}}
      """
    Then kogen-loop-run-refusals-name-the-fault: the run refusal has detail 'the task file empty-task.json is empty'
