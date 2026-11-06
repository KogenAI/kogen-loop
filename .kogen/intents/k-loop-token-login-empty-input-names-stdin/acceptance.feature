Feature: A key or token login that reads no input says where the input comes from
  A key or token login (anthropic, opencode-go, claude-code) whose standard input ends before
  any byte was read (standard input from /dev/null, closed, or an empty pipe) is refused with
  a text that names standard input and shows the piped form of that login, with no value. A
  login interrupted by a signal while it waits on a terminal still says "interrupted", invalid
  input keeps its invalid-key text, and a file with a valid key still signs in. This repository
  has no `kogen` command of its own: the steps build a stand-in `kogen provider login <name>`
  that signs in through the public provider.Client.Login with its own standard input, HOME and
  signals, prints a refusal's rendered line on stderr and exits with its code. Each scenario
  starts in a fresh HOME where the login already holds an old key.

  Background:
    Given k-loop-token-login-empty-input-names-stdin: the kogen login command built from this checkout

  Scenario: An Anthropic login with standard input from /dev/null names standard input and the piped form
    Given k-loop-token-login-empty-input-names-stdin: a HOME where "anthropic" is signed in with the key "SYNTHETIC-old-key"
    When k-loop-token-login-empty-input-names-stdin: I run "kogen provider login anthropic < /dev/null"
    Then k-loop-token-login-empty-input-names-stdin: the exit code is 4
    And k-loop-token-login-empty-input-names-stdin: the output is exactly:
      """
      provider/login: no Anthropic key input was read from standard input; pipe the key: printf '%s' "$KEY" | kogen provider login anthropic; saved login unchanged
      """
    And k-loop-token-login-empty-input-names-stdin: the output contains "standard input"
    And k-loop-token-login-empty-input-names-stdin: the output does not contain "interrupted"
    And k-loop-token-login-empty-input-names-stdin: the saved "anthropic" login is unchanged

  Scenario: A Claude Code login with standard input from /dev/null names standard input and the piped form
    Given k-loop-token-login-empty-input-names-stdin: a HOME where "claude-code" is signed in with the key "SYNTHETIC-old-token"
    When k-loop-token-login-empty-input-names-stdin: I run "kogen provider login claude-code < /dev/null"
    Then k-loop-token-login-empty-input-names-stdin: the exit code is 4
    And k-loop-token-login-empty-input-names-stdin: the output is exactly:
      """
      provider/login_failed: no Claude Code token input was read from standard input; pipe the token: printf '%s' "$TOKEN" | kogen provider login claude-code; saved login unchanged
      """
    And k-loop-token-login-empty-input-names-stdin: the output contains "standard input"
    And k-loop-token-login-empty-input-names-stdin: the output does not contain "interrupted"
    And k-loop-token-login-empty-input-names-stdin: the saved "claude-code" login is unchanged

  Scenario: An OpenCode Go login with standard input from /dev/null names standard input and the piped form
    Given k-loop-token-login-empty-input-names-stdin: a HOME where "opencode-go" is signed in with the key "SYNTHETIC-old-key"
    When k-loop-token-login-empty-input-names-stdin: I run "kogen provider login opencode-go < /dev/null"
    Then k-loop-token-login-empty-input-names-stdin: the exit code is 4
    And k-loop-token-login-empty-input-names-stdin: the output is exactly:
      """
      provider/login_failed: no OpenCode Go key input was read from standard input; pipe the key: printf '%s' "$KEY" | kogen provider login opencode-go; saved login unchanged
      """
    And k-loop-token-login-empty-input-names-stdin: the output contains "standard input"
    And k-loop-token-login-empty-input-names-stdin: the output does not contain "interrupted"
    And k-loop-token-login-empty-input-names-stdin: the saved "opencode-go" login is unchanged

  Scenario: A login with standard input closed names standard input and the piped form
    Given k-loop-token-login-empty-input-names-stdin: a HOME where "opencode-go" is signed in with the key "SYNTHETIC-old-key"
    When k-loop-token-login-empty-input-names-stdin: I run "kogen provider login opencode-go <&-"
    Then k-loop-token-login-empty-input-names-stdin: the exit code is 4
    And k-loop-token-login-empty-input-names-stdin: the output is exactly:
      """
      provider/login_failed: no OpenCode Go key input was read from standard input; pipe the key: printf '%s' "$KEY" | kogen provider login opencode-go; saved login unchanged
      """
    And k-loop-token-login-empty-input-names-stdin: the output does not contain "interrupted"
    And k-loop-token-login-empty-input-names-stdin: the saved "opencode-go" login is unchanged

  Scenario: An Anthropic login from an empty pipe names standard input and the piped form
    Given k-loop-token-login-empty-input-names-stdin: a HOME where "anthropic" is signed in with the key "SYNTHETIC-old-key"
    When k-loop-token-login-empty-input-names-stdin: I run "printf '' | kogen provider login anthropic"
    Then k-loop-token-login-empty-input-names-stdin: the exit code is 4
    And k-loop-token-login-empty-input-names-stdin: the output is exactly:
      """
      provider/login: no Anthropic key input was read from standard input; pipe the key: printf '%s' "$KEY" | kogen provider login anthropic; saved login unchanged
      """
    And k-loop-token-login-empty-input-names-stdin: the saved "anthropic" login is unchanged

  Scenario: A Claude Code login from an empty pipe names standard input and the piped form
    Given k-loop-token-login-empty-input-names-stdin: a HOME where "claude-code" is signed in with the key "SYNTHETIC-old-token"
    When k-loop-token-login-empty-input-names-stdin: I run "printf '' | kogen provider login claude-code"
    Then k-loop-token-login-empty-input-names-stdin: the exit code is 4
    And k-loop-token-login-empty-input-names-stdin: the output is exactly:
      """
      provider/login_failed: no Claude Code token input was read from standard input; pipe the token: printf '%s' "$TOKEN" | kogen provider login claude-code; saved login unchanged
      """
    And k-loop-token-login-empty-input-names-stdin: the saved "claude-code" login is unchanged

  Scenario: A blank line is input that was read and keeps its no-key text
    Given k-loop-token-login-empty-input-names-stdin: a HOME where "anthropic" is signed in with the key "SYNTHETIC-old-key"
    When k-loop-token-login-empty-input-names-stdin: I run "printf '\n' | kogen provider login anthropic"
    Then k-loop-token-login-empty-input-names-stdin: the exit code is 4
    And k-loop-token-login-empty-input-names-stdin: the output is exactly:
      """
      provider/login: no Anthropic key supplied; saved login unchanged
      """
    And k-loop-token-login-empty-input-names-stdin: the saved "anthropic" login is unchanged

  Scenario: A login interrupted by SIGINT while waiting on a terminal still says interrupted
    Given k-loop-token-login-empty-input-names-stdin: a HOME where "anthropic" is signed in with the key "SYNTHETIC-old-key"
    When k-loop-token-login-empty-input-names-stdin: I run "kogen provider login anthropic" on a terminal and send SIGINT while it waits for input
    Then k-loop-token-login-empty-input-names-stdin: the exit code is 130
    And k-loop-token-login-empty-input-names-stdin: the output contains "interrupted by SIGINT"
    And k-loop-token-login-empty-input-names-stdin: the output does not contain "standard input"
    And k-loop-token-login-empty-input-names-stdin: the saved "anthropic" login is unchanged

  Scenario: An invalid Anthropic key keeps its invalid-key text and is not echoed
    Given k-loop-token-login-empty-input-names-stdin: a HOME where "anthropic" is signed in with the key "SYNTHETIC-old-key"
    And k-loop-token-login-empty-input-names-stdin: a file "two-lines.txt" containing:
      """
      first-line
      second-line
      """
    When k-loop-token-login-empty-input-names-stdin: I run "kogen provider login anthropic < two-lines.txt"
    Then k-loop-token-login-empty-input-names-stdin: the exit code is 4
    And k-loop-token-login-empty-input-names-stdin: the output is exactly:
      """
      provider/login: invalid Anthropic key input; saved login unchanged
      """
    And k-loop-token-login-empty-input-names-stdin: the output does not contain "first-line"
    And k-loop-token-login-empty-input-names-stdin: the saved "anthropic" login is unchanged

  Scenario: An invalid Claude Code token keeps its invalid-token text and is not echoed
    Given k-loop-token-login-empty-input-names-stdin: a HOME where "claude-code" is signed in with the key "SYNTHETIC-old-token"
    And k-loop-token-login-empty-input-names-stdin: a file "token.txt" containing:
      """
      not a token
      """
    When k-loop-token-login-empty-input-names-stdin: I run "kogen provider login claude-code < token.txt"
    Then k-loop-token-login-empty-input-names-stdin: the exit code is 4
    And k-loop-token-login-empty-input-names-stdin: the output is exactly:
      """
      provider/login_failed: invalid Claude Code token input: the token must be one line of letters, digits, dot, underscore and hyphen only; saved login unchanged
      """
    And k-loop-token-login-empty-input-names-stdin: the output does not contain "not a token"
    And k-loop-token-login-empty-input-names-stdin: the saved "claude-code" login is unchanged

  Scenario: A file with a valid Anthropic key given with < file still signs in
    Given k-loop-token-login-empty-input-names-stdin: a HOME where "anthropic" is signed in with the key "SYNTHETIC-old-key"
    And k-loop-token-login-empty-input-names-stdin: a file "anthropic-key.txt" containing:
      """
      SYNTHETIC-new-key-0123
      """
    When k-loop-token-login-empty-input-names-stdin: I run "kogen provider login anthropic < anthropic-key.txt"
    Then k-loop-token-login-empty-input-names-stdin: the exit code is 0
    And k-loop-token-login-empty-input-names-stdin: the output is exactly:
      """
      anthropic: key saved (not verified)
      """
    And k-loop-token-login-empty-input-names-stdin: the saved "anthropic" login holds the key "SYNTHETIC-new-key-0123"

  Scenario: A file with a valid Claude Code token given with < file still signs in
    Given k-loop-token-login-empty-input-names-stdin: a HOME where "claude-code" is signed in with the key "SYNTHETIC-old-token"
    And k-loop-token-login-empty-input-names-stdin: a file "claude-token.txt" containing:
      """
      SYNTHETIC-new-token-0123
      """
    When k-loop-token-login-empty-input-names-stdin: I run "kogen provider login claude-code < claude-token.txt"
    Then k-loop-token-login-empty-input-names-stdin: the exit code is 0
    And k-loop-token-login-empty-input-names-stdin: the output is exactly:
      """
      claude-code: token saved (not verified)
      """
    And k-loop-token-login-empty-input-names-stdin: the saved "claude-code" login holds the key "SYNTHETIC-new-token-0123"
