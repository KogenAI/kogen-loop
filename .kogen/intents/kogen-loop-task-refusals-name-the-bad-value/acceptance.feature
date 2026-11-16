Feature: Task refusals name the bad value and what is accepted

  This feature covers the invalid_task detail for a provider, a tool or a terminal tool name that cannot be used, through kogen-loop run and through loop.NewSession.

  Scenario: CLI refuses an unknown provider and lists the providers
    Given kogen-loop-task-refusals-name-the-bad-value: the CLI and the library driver are built from this checkout
    When kogen-loop-task-refusals-name-the-bad-value: I run the CLI with a task whose fields are overridden by:
      """
      {"role": {"provider": "nobody", "model": "m", "effort": "e", "base_url": ""}}
      """
    Then kogen-loop-task-refusals-name-the-bad-value: the CLI refuses the task as loop/invalid_task with exit code 2 and ends the session as failed before it starts
    Then kogen-loop-task-refusals-name-the-bad-value: the refusal has class "loop", reason "invalid_task" and detail "unknown provider nobody; the providers are chatgpt, supergrok, opencode-go, anthropic, openai-compatible"

  Scenario: CLI refuses a missing provider as required
    Given kogen-loop-task-refusals-name-the-bad-value: the CLI and the library driver are built from this checkout
    When kogen-loop-task-refusals-name-the-bad-value: I run the CLI with a task whose fields are overridden by:
      """
      {"role": {"provider": "", "model": "m", "effort": "e", "base_url": ""}}
      """
    Then kogen-loop-task-refusals-name-the-bad-value: the CLI refuses the task as loop/invalid_task with exit code 2 and ends the session as failed before it starts
    Then kogen-loop-task-refusals-name-the-bad-value: the refusal has class "loop", reason "invalid_task" and detail "role.provider is required; the providers are chatgpt, supergrok, opencode-go, anthropic, openai-compatible"

  Scenario: CLI refuses an unknown tool and lists the tools
    Given kogen-loop-task-refusals-name-the-bad-value: the CLI and the library driver are built from this checkout
    When kogen-loop-task-refusals-name-the-bad-value: I run the CLI with a task whose fields are overridden by:
      """
      {"tools": ["read_file", "teleport"]}
      """
    Then kogen-loop-task-refusals-name-the-bad-value: the CLI refuses the task as loop/invalid_task with exit code 2 and ends the session as failed before it starts
    Then kogen-loop-task-refusals-name-the-bad-value: the refusal has class "loop", reason "invalid_task" and detail "unknown tool teleport; the tools are read_file, write_file, list_files, search_text, shell, view_image, documentation"

  Scenario: CLI refuses a terminal name that is an enabled tool
    Given kogen-loop-task-refusals-name-the-bad-value: the CLI and the library driver are built from this checkout
    When kogen-loop-task-refusals-name-the-bad-value: I run the CLI with a task whose fields are overridden by:
      """
      {"terminal": ["shell"]}
      """
    Then kogen-loop-task-refusals-name-the-bad-value: the CLI refuses the task as loop/invalid_task with exit code 2 and ends the session as failed before it starts
    Then kogen-loop-task-refusals-name-the-bad-value: the refusal has class "loop", reason "invalid_task" and detail "terminal tool shell is also an enabled tool"

  Scenario: CLI refuses an empty terminal name
    Given kogen-loop-task-refusals-name-the-bad-value: the CLI and the library driver are built from this checkout
    When kogen-loop-task-refusals-name-the-bad-value: I run the CLI with a task whose fields are overridden by:
      """
      {"terminal": [""]}
      """
    Then kogen-loop-task-refusals-name-the-bad-value: the CLI refuses the task as loop/invalid_task with exit code 2 and ends the session as failed before it starts
    Then kogen-loop-task-refusals-name-the-bad-value: the refusal has class "loop", reason "invalid_task" and detail "a terminal tool name must not be empty"

  Scenario: CLI refuses a repeated terminal name
    Given kogen-loop-task-refusals-name-the-bad-value: the CLI and the library driver are built from this checkout
    When kogen-loop-task-refusals-name-the-bad-value: I run the CLI with a task whose fields are overridden by:
      """
      {"terminal": ["finish", "finish"]}
      """
    Then kogen-loop-task-refusals-name-the-bad-value: the CLI refuses the task as loop/invalid_task with exit code 2 and ends the session as failed before it starts
    Then kogen-loop-task-refusals-name-the-bad-value: the refusal has class "loop", reason "invalid_task" and detail "duplicate terminal tool finish"

  Scenario: Library refuses an unknown provider and lists the providers
    Given kogen-loop-task-refusals-name-the-bad-value: the CLI and the library driver are built from this checkout
    When kogen-loop-task-refusals-name-the-bad-value: I start a library session with the config:
      """
      {"provider": "nobody"}
      """
    Then kogen-loop-task-refusals-name-the-bad-value: the library refuses the session as loop/invalid_task
    Then kogen-loop-task-refusals-name-the-bad-value: the refusal has class "loop", reason "invalid_task" and detail "unknown provider nobody; the providers are chatgpt, supergrok, opencode-go, anthropic, openai-compatible"

  Scenario: Library refuses a missing provider as required
    Given kogen-loop-task-refusals-name-the-bad-value: the CLI and the library driver are built from this checkout
    When kogen-loop-task-refusals-name-the-bad-value: I start a library session with the config:
      """
      {"provider": ""}
      """
    Then kogen-loop-task-refusals-name-the-bad-value: the library refuses the session as loop/invalid_task
    Then kogen-loop-task-refusals-name-the-bad-value: the refusal has class "loop", reason "invalid_task" and detail "role.provider is required; the providers are chatgpt, supergrok, opencode-go, anthropic, openai-compatible"

  Scenario: Library refuses an unknown tool and lists the tools
    Given kogen-loop-task-refusals-name-the-bad-value: the CLI and the library driver are built from this checkout
    When kogen-loop-task-refusals-name-the-bad-value: I start a library session with the config:
      """
      {"provider": "chatgpt", "tools": ["read_file", "teleport"]}
      """
    Then kogen-loop-task-refusals-name-the-bad-value: the library refuses the session as loop/invalid_task
    Then kogen-loop-task-refusals-name-the-bad-value: the refusal has class "loop", reason "invalid_task" and detail "unknown tool teleport; the tools are read_file, write_file, list_files, search_text, shell, view_image, documentation"

  Scenario: Library refuses a terminal name that is an enabled tool
    Given kogen-loop-task-refusals-name-the-bad-value: the CLI and the library driver are built from this checkout
    When kogen-loop-task-refusals-name-the-bad-value: I start a library session with the config:
      """
      {"provider": "chatgpt", "terminal": ["shell"]}
      """
    Then kogen-loop-task-refusals-name-the-bad-value: the library refuses the session as loop/invalid_task
    Then kogen-loop-task-refusals-name-the-bad-value: the refusal has class "loop", reason "invalid_task" and detail "terminal tool shell is also an enabled tool"

  Scenario: Library refuses an empty terminal name
    Given kogen-loop-task-refusals-name-the-bad-value: the CLI and the library driver are built from this checkout
    When kogen-loop-task-refusals-name-the-bad-value: I start a library session with the config:
      """
      {"provider": "chatgpt", "terminal": [""]}
      """
    Then kogen-loop-task-refusals-name-the-bad-value: the library refuses the session as loop/invalid_task
    Then kogen-loop-task-refusals-name-the-bad-value: the refusal has class "loop", reason "invalid_task" and detail "a terminal tool name must not be empty"

  Scenario: Library refuses a repeated terminal name
    Given kogen-loop-task-refusals-name-the-bad-value: the CLI and the library driver are built from this checkout
    When kogen-loop-task-refusals-name-the-bad-value: I start a library session with the config:
      """
      {"provider": "chatgpt", "terminal": ["finish", "finish"]}
      """
    Then kogen-loop-task-refusals-name-the-bad-value: the library refuses the session as loop/invalid_task
    Then kogen-loop-task-refusals-name-the-bad-value: the refusal has class "loop", reason "invalid_task" and detail "duplicate terminal tool finish"
