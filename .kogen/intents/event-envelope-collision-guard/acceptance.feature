Feature: Preserve the Event.MarshalJSON envelope guard
  This feature exercises behavior that already exists; the requested change adds direct Go regression tests without changing production encoding.

  Background:
    Given event-envelope-collision-guard: an event with this envelope
      """
      {"protocol":"kogen-loop/v1","seq":1,"time":"2026-01-01T00:00:00Z","type":"request.started"}
      """

  Scenario: Refuse a protocol collision
    When event-envelope-collision-guard: MarshalJSON is called with these fields
      """
      {"protocol":"replacement"}
      """
    Then event-envelope-collision-guard: the error is 'event field "protocol" collides with the envelope'

  Scenario: Refuse a seq collision
    When event-envelope-collision-guard: MarshalJSON is called with these fields
      """
      {"seq":2}
      """
    Then event-envelope-collision-guard: the error is 'event field "seq" collides with the envelope'

  Scenario: Refuse a time collision
    When event-envelope-collision-guard: MarshalJSON is called with these fields
      """
      {"time":"2026-01-02T00:00:00Z"}
      """
    Then event-envelope-collision-guard: the error is 'event field "time" collides with the envelope'

  Scenario: Refuse a type collision
    When event-envelope-collision-guard: MarshalJSON is called with these fields
      """
      {"type":"response"}
      """
    Then event-envelope-collision-guard: the error is 'event field "type" collides with the envelope'

  Scenario: Keep ordinary fields at the top level
    When event-envelope-collision-guard: MarshalJSON is called with these fields
      """
      {"n":3,"model":"test-model"}
      """
    Then event-envelope-collision-guard: encoding succeeds with this JSON object
      """
      {"protocol":"kogen-loop/v1","seq":1,"time":"2026-01-01T00:00:00Z","type":"request.started","n":3,"model":"test-model"}
      """
