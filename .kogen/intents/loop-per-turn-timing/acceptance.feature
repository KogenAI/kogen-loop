Feature: Every response event carries the wall time of its model turn
  This feature runs real sessions against a fake openai-compatible provider with the probe tool
  and an injected clock. The fake provider advances the clock before it answers and each probe
  call advances it by its stated duration. Each turn is written as "provider ms:probe call ms".

  Scenario: Tool call time elapsed_ms is unchanged
    Given loop-per-turn-timing: a round on the injected clock with the turns "300:200 | 100:150,50 | 100:finish"
    When loop-per-turn-timing: the round runs
    Then loop-per-turn-timing: the tool.result events carry elapsed_ms "200,150,50" and the finish call has none

  Scenario: Model time per turn is separate from tool time
    Given loop-per-turn-timing: a round on the injected clock with the turns "300:200 | 100:150,50 | 100:finish"
    When loop-per-turn-timing: the round runs
    Then loop-per-turn-timing: the response events carry model_ms "300,100,100" as integers in that order
    And loop-per-turn-timing: the sum of every model_ms and elapsed_ms is at most the wall time of 900 ms on the injected clock

  Scenario: Model time is measured on the real clock when the tools clock is nil
    Given loop-per-turn-timing: a round with the tools clock left nil and the turns "0:finish"
    When loop-per-turn-timing: the round runs
    Then loop-per-turn-timing: the response event has model_ms as a non-negative integer of Go type int64
