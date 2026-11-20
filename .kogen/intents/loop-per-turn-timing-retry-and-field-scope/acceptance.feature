Feature: A retried request is one model turn and only response events carry model_ms
  This feature runs real sessions against a fake openai-compatible provider on one injected clock. The fake provider advances the clock before it answers.

  Scenario: A retried request is one turn
    Given loop-per-turn-timing-retry-and-field-scope: a round where the first attempt fails with HTTP 500 after 100 ms and the second answers after 200 ms
    When loop-per-turn-timing-retry-and-field-scope: the round runs
    Then loop-per-turn-timing-retry-and-field-scope: the round has exactly one response event whose model_ms is 300 as an integer

  Scenario: Only response events carry model_ms
    Given loop-per-turn-timing-retry-and-field-scope: a round whose history grows past the request ceiling so that it is condensed once
    When loop-per-turn-timing-retry-and-field-scope: the round runs
    Then loop-per-turn-timing-retry-and-field-scope: model_ms is an integer on every response event and on no other event
