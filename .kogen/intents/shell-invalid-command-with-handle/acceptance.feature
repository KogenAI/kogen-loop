Feature: Shell refuses a non-string command even with a handle
  This feature checks that the shell tool refuses a supplied command that is not a string, also when a valid handle is supplied, while the supported ways to select a command or a handle keep working.

  Background:
    Given shell-invalid-command-with-handle: the shell tool is available with a running command whose handle is '$HANDLE'

  Scenario: a numeric command with a valid handle is refused
    When shell-invalid-command-with-handle: the shell tool is called with the arguments '{"command": 42, "handle": "$HANDLE"}'
    Then shell-invalid-command-with-handle: the call is refused as a wrong argument type
    And shell-invalid-command-with-handle: the refusal message names command

  Scenario: a boolean command with a valid handle is refused
    When shell-invalid-command-with-handle: the shell tool is called with the arguments '{"command": true, "handle": "$HANDLE"}'
    Then shell-invalid-command-with-handle: the call is refused as a wrong argument type
    And shell-invalid-command-with-handle: the refusal message names command

  Scenario: a numeric command with an empty handle is still refused
    When shell-invalid-command-with-handle: the shell tool is called with the arguments '{"command": 42, "handle": ""}'
    Then shell-invalid-command-with-handle: the call is refused as a wrong argument type
    And shell-invalid-command-with-handle: the refusal message names command

  Scenario: a valid command with no handle starts a command
    When shell-invalid-command-with-handle: the shell tool is called with the arguments '{"command": "printf ok"}'
    Then shell-invalid-command-with-handle: the command runs to completion with status 0 and output "ok"

  Scenario: a valid command with a null handle starts a command
    When shell-invalid-command-with-handle: the shell tool is called with the arguments '{"command": "printf ok", "handle": null}'
    Then shell-invalid-command-with-handle: the command runs to completion with status 0 and output "ok"

  Scenario: a valid command with an empty handle starts a command
    When shell-invalid-command-with-handle: the shell tool is called with the arguments '{"command": "printf ok", "handle": ""}'
    Then shell-invalid-command-with-handle: the command runs to completion with status 0 and output "ok"

  Scenario: a valid command with a numeric handle starts a command
    When shell-invalid-command-with-handle: the shell tool is called with the arguments '{"command": "printf ok", "handle": 42}'
    Then shell-invalid-command-with-handle: the command runs to completion with status 0 and output "ok"

  Scenario: a valid command with a boolean handle starts a command
    When shell-invalid-command-with-handle: the shell tool is called with the arguments '{"command": "printf ok", "handle": false}'
    Then shell-invalid-command-with-handle: the command runs to completion with status 0 and output "ok"

  Scenario: a valid handle without a command retrieves that handle
    When shell-invalid-command-with-handle: the shell tool is called with the arguments '{"handle": "$HANDLE"}'
    Then shell-invalid-command-with-handle: the running command is retrieved by its handle
