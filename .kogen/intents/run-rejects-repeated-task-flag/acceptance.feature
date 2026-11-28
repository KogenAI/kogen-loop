Feature: run refuses a repeated task flag
  This feature covers the kogen-loop run command: supplying the task flag more than once is refused as an invalid task before any task is read, while a single task flag keeps its behavior.

  Background:
    Given run-rejects-repeated-task-flag: the kogen-loop binary is built

  Scenario: Two task flags with different paths are refused before either file is read
    When run-rejects-repeated-task-flag: I run kogen-loop with arguments "run --task /nonexistent/first.json --task /nonexistent/second.json"
    Then run-rejects-repeated-task-flag: it exits with code 2
    And run-rejects-repeated-task-flag: stdout is an error event followed by a session.ended event with exit 2
    And run-rejects-repeated-task-flag: the error event has reason "invalid_task"
    And run-rejects-repeated-task-flag: the error detail names the --task option as given more than once
    And run-rejects-repeated-task-flag: the error detail does not contain "cannot read the task"

  Scenario: Two task flags with the same path are refused
    When run-rejects-repeated-task-flag: I run kogen-loop with arguments "run --task /nonexistent/same.json --task /nonexistent/same.json"
    Then run-rejects-repeated-task-flag: it exits with code 2
    And run-rejects-repeated-task-flag: stdout is an error event followed by a session.ended event with exit 2
    And run-rejects-repeated-task-flag: the error event has reason "invalid_task"
    And run-rejects-repeated-task-flag: the error detail names the --task option as given more than once
    And run-rejects-repeated-task-flag: the error detail does not contain "cannot read the task"

  Scenario: The equals form of the task flag also counts as a repeat
    When run-rejects-repeated-task-flag: I run kogen-loop with arguments "run --task=/nonexistent/same.json --task /nonexistent/same.json"
    Then run-rejects-repeated-task-flag: it exits with code 2
    And run-rejects-repeated-task-flag: the error event has reason "invalid_task"
    And run-rejects-repeated-task-flag: the error detail names the --task option as given more than once

  Scenario: Two standard input task flags are refused without reading standard input
    When run-rejects-repeated-task-flag: I run kogen-loop with arguments "run --task - --task -" and a kogen-loop/v2 task on standard input
    Then run-rejects-repeated-task-flag: it exits with code 2
    And run-rejects-repeated-task-flag: the error event has reason "invalid_task"
    And run-rejects-repeated-task-flag: the error detail names the --task option as given more than once

  Scenario: A single task flag naming a missing file keeps its read failure
    When run-rejects-repeated-task-flag: I run kogen-loop with arguments "run --task /nonexistent/only.json"
    Then run-rejects-repeated-task-flag: it exits with code 2
    And run-rejects-repeated-task-flag: the error event has reason "invalid_task"
    And run-rejects-repeated-task-flag: the error detail contains "cannot read the task"

  Scenario: A single standard input task flag with empty input keeps its refusal
    When run-rejects-repeated-task-flag: I run kogen-loop with arguments "run --task -"
    Then run-rejects-repeated-task-flag: it exits with code 2
    And run-rejects-repeated-task-flag: the error event has reason "invalid_task"
    And run-rejects-repeated-task-flag: the error detail contains "the task read from standard input is empty"

  Scenario: A single standard input task flag still reads the task
    When run-rejects-repeated-task-flag: I run kogen-loop with arguments "run --task -" and a kogen-loop/v2 task on standard input
    Then run-rejects-repeated-task-flag: it exits with code 2
    And run-rejects-repeated-task-flag: the error event has reason "unsupported_protocol"
    And run-rejects-repeated-task-flag: the error detail contains "kogen-loop/v2"
