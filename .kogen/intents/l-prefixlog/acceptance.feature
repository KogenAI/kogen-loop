Feature: Library-only request prefix instrumentation
  Scenario Outline: Prefix logging contract
    When I run the prefix logging behavioral tests
    Then prefix logging test "<name>" must pass for "<rule>"
    Examples:
      | name | rule |
      | TestPrefixLogOffsets | first has no offset; identical reports no divergence; 10239, 10240 and 10241 are byte offsets; strict prefixes diverge at shorter length |
      | TestPrefixLogAttempts | every actual attempt including retries; two sent bodies sharing 10 KB diverge at byte 10240; report both captured body sizes across all wire routes |
      | TestPrefixLogOff | default off gives identical request bytes, no events and no instrumentation memory |
      | TestPrefixLogLifetime | isolated conversations retain only previous body and release it at conversation end |
      | TestPrefixLogMetadata | role and context allow research grouping; Render and Body do not emit; no body text in events |
