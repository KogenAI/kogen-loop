Feature: Bound the credential read from a non-terminal input
  A key or token login (opencode-go, anthropic, openai-compatible, claude-code) that reads its
  secret from a non-terminal input reads at most 16384 bytes of credential input. Input past
  that bound is refused through the existing invalid key or token refusal, which carries none
  of the input, and the previously saved login keeps its bytes. Reads within the bound, a
  trailing newline included, and the terminal line read behave as today. A cancelled login
  still returns the context error, and its reader stops reading at the bound. Every login runs
  through the public provider.Client.Login in a fresh HOME that already holds the key old-key;
  long inputs repeat the letters XQZJ.

  Scenario: An endless non-terminal input is refused promptly as an invalid credential
    When l-credential-stdin-size-bound: I log in to the key providers with the scripted inputs under a bound of 16384 bytes
    Then l-credential-stdin-size-bound: the case "endless-opencode-go" observed:
      """
      {"returned_within_5s": true,
       "error": {"class": "provider", "reason": "login_failed", "exit": 4, "detail": "invalid OpenCode Go key input; saved login unchanged"},
       "saved": "old-key", "stdout": "", "stderr": "", "echoes_input": false,
       "consumed": 16385, "allocated_under_64_bounds": true}
      """
    And l-credential-stdin-size-bound: the case "endless-claude-code" observed:
      """
      {"returned_within_5s": true,
       "error": {"class": "provider", "reason": "login_failed", "exit": 4, "detail": "invalid Claude Code token input: the token must be one line of letters, digits, dot, underscore and hyphen only; saved login unchanged"},
       "saved": "old-key", "stdout": "", "stderr": "", "echoes_input": false,
       "consumed": 16385, "allocated_under_64_bounds": true}
      """

  Scenario: Reads within the bound behave as today and one byte past the bound is refused
    When l-credential-stdin-size-bound: I log in to the key providers with the scripted inputs under a bound of 16384 bytes
    Then l-credential-stdin-size-bound: the case "short-opencode-go" observed:
      """
      {"returned_within_5s": true, "error": null, "saved": "SYNTHETIC-short-key",
       "stdout": "opencode-go: key saved (not verified)\n", "stderr": "", "echoes_input": false}
      """
    And l-credential-stdin-size-bound: the case "short-newline-opencode-go" observed:
      """
      {"returned_within_5s": true, "error": null, "saved": "SYNTHETIC-short-key",
       "stdout": "opencode-go: key saved (not verified)\n", "stderr": "", "echoes_input": false}
      """
    And l-credential-stdin-size-bound: the case "short-claude-code" observed:
      """
      {"returned_within_5s": true, "error": null, "saved": "SYNTHETIC-short-key",
       "stdout": "claude-code: token saved (not verified)\n", "stderr": "", "echoes_input": false}
      """
    And l-credential-stdin-size-bound: the case "short-newline-claude-code" observed:
      """
      {"returned_within_5s": true, "error": null, "saved": "SYNTHETIC-short-key",
       "stdout": "claude-code: token saved (not verified)\n", "stderr": "", "echoes_input": false}
      """
    And l-credential-stdin-size-bound: the case "bound-opencode-go" observed:
      """
      {"returned_within_5s": true, "error": null, "saved": "the 16384-byte input credential",
       "stdout": "opencode-go: key saved (not verified)\n", "stderr": "", "echoes_input": false}
      """
    And l-credential-stdin-size-bound: the case "bound-claude-code" observed:
      """
      {"returned_within_5s": true, "error": null, "saved": "the 16384-byte input credential",
       "stdout": "claude-code: token saved (not verified)\n", "stderr": "", "echoes_input": false}
      """
    And l-credential-stdin-size-bound: the case "bound-minus-one-newline-opencode-go" observed:
      """
      {"returned_within_5s": true, "error": null, "saved": "the 16383-byte input credential",
       "stdout": "opencode-go: key saved (not verified)\n", "stderr": "", "echoes_input": false}
      """
    And l-credential-stdin-size-bound: the case "terminal-long-line-opencode-go" observed:
      """
      {"returned_within_5s": true, "error": null, "saved": "the 32768-byte input credential",
       "stdout": "opencode-go: key saved (not verified)\n", "stderr": "", "echoes_input": false}
      """
    And l-credential-stdin-size-bound: the case "bound-plus-one-opencode-go" observed:
      """
      {"returned_within_5s": true,
       "error": {"class": "provider", "reason": "login_failed", "exit": 4, "detail": "invalid OpenCode Go key input; saved login unchanged"},
       "saved": "old-key", "stdout": "", "stderr": "", "echoes_input": false, "consumed": 16385}
      """
    And l-credential-stdin-size-bound: the case "bound-plus-one-anthropic" observed:
      """
      {"returned_within_5s": true,
       "error": {"class": "provider", "reason": "login", "exit": 4, "detail": "invalid Anthropic key input; saved login unchanged"},
       "saved": "old-key", "stdout": "", "stderr": "", "echoes_input": false, "consumed": 16385}
      """
    And l-credential-stdin-size-bound: the case "bound-plus-one-claude-code" observed:
      """
      {"returned_within_5s": true,
       "error": {"class": "provider", "reason": "login_failed", "exit": 4, "detail": "invalid Claude Code token input: the token must be one line of letters, digits, dot, underscore and hyphen only; saved login unchanged"},
       "saved": "old-key", "stdout": "", "stderr": "", "echoes_input": false, "consumed": 16385}
      """
    And l-credential-stdin-size-bound: the case "bound-newline-opencode-go" observed:
      """
      {"returned_within_5s": true,
       "error": {"class": "provider", "reason": "login_failed", "exit": 4, "detail": "invalid OpenCode Go key input; saved login unchanged"},
       "saved": "old-key", "stdout": "", "stderr": "", "echoes_input": false, "consumed": 16385}
      """

  Scenario: A cancelled login returns the context error and its reader stops at the bound
    When l-credential-stdin-size-bound: I log in to the key providers with the scripted inputs under a bound of 16384 bytes
    Then l-credential-stdin-size-bound: the case "cancelled-opencode-go" observed:
      """
      {"read_started": true, "returned_within_5s_of_cancel": true,
       "error": {"text": "context canceled", "is_context_canceled": true},
       "saved": "old-key", "stdout": "", "stderr": "",
       "consumed_after_cancel_at_most_bound_plus_one": true, "reading_stopped": true}
      """
