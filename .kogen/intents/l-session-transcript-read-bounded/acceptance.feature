Feature: Refuse an oversized or corrupt session transcript before loading it whole
  `kogen-loop run` with `session.resume` and `loop.ResumeSession` look at the size of
  `<session.dir>/session.json` before reading it. A file larger than 67108864 bytes (64 MiB) is
  refused with `loop/session_mismatch` and a message naming its size and the bound, without
  being read; a transcript at or under the bound is decoded from the open file and resumes as
  before. `<dir>` in an expected event or error stands for the scenario's private session
  directory.

  Scenario: A sparse transcript one byte above the bound is refused through the CLI before any request
    Given l-session-transcript-read-bounded: a session directory written by a short session that ended with the finish call "c1"
    And l-session-transcript-read-bounded: its session.json is replaced by a sparse file of 67108865 bytes
    When l-session-transcript-read-bounded: I resume it through the CLI with the prompt "feedback: check again" while the provider answers "never"
    Then l-session-transcript-read-bounded: the resume exits 2 after 0 provider requests
    And l-session-transcript-read-bounded: the resume emitted exactly these events:
      """
      [
        {"type": "error", "class": "loop", "reason": "session_mismatch", "detail": "the session transcript at <dir>/session.json is 67108865 bytes, more than the limit of 67108864 bytes"},
        {"type": "session.ended", "status": "failed", "exit": 2}
      ]
      """

  Scenario: loop.ResumeSession refuses a sparse transcript above the bound promptly without reading it
    Given l-session-transcript-read-bounded: a session directory whose only file is a sparse session.json of 67108865 bytes
    When l-session-transcript-read-bounded: I resume it through loop.ResumeSession
    Then l-session-transcript-read-bounded: loop.ResumeSession returned no session and the error:
      """
      {"class": "loop", "reason": "session_mismatch", "detail": "the session transcript at <dir>/session.json is 67108865 bytes, more than the limit of 67108864 bytes", "exit": 2}
      """
    And l-session-transcript-read-bounded: the call allocated fewer than 4194304 heap bytes and returned within 1000 ms

  Scenario: loop.ResumeSession decodes a transcript exactly at the bound from the open file without loading it whole
    Given l-session-transcript-read-bounded: a session directory written by a short session that ended with the finish call "c1"
    And l-session-transcript-read-bounded: its session.json is padded with spaces to exactly 67108864 bytes
    When l-session-transcript-read-bounded: I resume it through loop.ResumeSession
    Then l-session-transcript-read-bounded: loop.ResumeSession returned the saved session without an error
    And l-session-transcript-read-bounded: the call allocated fewer than 4194304 heap bytes and returned within 1000 ms

  Scenario: A transcript written by a short session resumes and continues exactly as before
    Given l-session-transcript-read-bounded: a session directory written by a short session that ended with the finish call "c1"
    When l-session-transcript-read-bounded: I resume it through the CLI with the prompt "feedback: check again" while the provider answers "second answer"
    Then l-session-transcript-read-bounded: the resume exits 0 after 1 provider request
    And l-session-transcript-read-bounded: session.started carries the saved session id with resumed true
    And l-session-transcript-read-bounded: the resumed request input is the saved input followed by the output "feedback: check again" for call "c1"
    And l-session-transcript-read-bounded: the round ended "no_call" with the claim "second answer"
    And l-session-transcript-read-bounded: session.json now holds the saved session id, terminal null and the resumed input followed by the answer

  Scenario: A transcript exactly at the bound is accepted
    Given l-session-transcript-read-bounded: a session directory written by a short session that ended with the finish call "c1"
    And l-session-transcript-read-bounded: its session.json is padded with spaces to exactly 67108864 bytes
    When l-session-transcript-read-bounded: I resume it through the CLI with the prompt "feedback: check again" while the provider answers "second answer"
    Then l-session-transcript-read-bounded: the resume exits 0 after 1 provider request
    And l-session-transcript-read-bounded: session.started carries the saved session id with resumed true
    And l-session-transcript-read-bounded: the resumed request input is the saved input followed by the output "feedback: check again" for call "c1"
    And l-session-transcript-read-bounded: the round ended "no_call" with the claim "second answer"

  Scenario: A missing transcript keeps today's message
    Given l-session-transcript-read-bounded: a session directory written by a short session that ended with the finish call "c1"
    And l-session-transcript-read-bounded: its session.json is removed
    When l-session-transcript-read-bounded: I resume it through the CLI with the prompt "feedback: check again" while the provider answers "never"
    Then l-session-transcript-read-bounded: the resume exits 2 after 0 provider requests
    And l-session-transcript-read-bounded: the resume emitted exactly these events:
      """
      [
        {"type": "error", "class": "loop", "reason": "session_mismatch", "detail": "no session transcript at <dir>/session.json"},
        {"type": "session.ended", "status": "failed", "exit": 2}
      ]
      """

  Scenario: An invalid-JSON transcript keeps today's message
    Given l-session-transcript-read-bounded: a session directory written by a short session that ended with the finish call "c1"
    And l-session-transcript-read-bounded: its session.json is replaced by the text "not json"
    When l-session-transcript-read-bounded: I resume it through the CLI with the prompt "feedback: check again" while the provider answers "never"
    Then l-session-transcript-read-bounded: the resume exits 2 after 0 provider requests
    And l-session-transcript-read-bounded: the resume emitted exactly these events:
      """
      [
        {"type": "error", "class": "loop", "reason": "session_mismatch", "detail": "the session transcript is not valid: invalid character 'o' in literal null (expecting 'u')"},
        {"type": "session.ended", "status": "failed", "exit": 2}
      ]
      """
