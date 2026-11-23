Feature: DecodeTask strictness is pinned by regression tests

  This feature checks that the api package tests fail when DecodeTask is made less strict or too strict.

  Scenario: An unknown top-level field is rejected
    Given task-decode-strict-fields: the api package is copied from this checkout and its tests pass on the real DecodeTask
    When task-decode-strict-fields: DecodeTask is replaced by the variant "drop-unknown"
    Then task-decode-strict-fields: the api tests fail with a test assertion

  Scenario: The rejection error identifies the unknown field
    Given task-decode-strict-fields: the api package is copied from this checkout and its tests pass on the real DecodeTask
    When task-decode-strict-fields: DecodeTask is replaced by the variant "unnamed-error"
    Then task-decode-strict-fields: the api tests fail with a test assertion

  Scenario: An unknown nested field is rejected
    Given task-decode-strict-fields: the api package is copied from this checkout and its tests pass on the real DecodeTask
    When task-decode-strict-fields: DecodeTask is replaced by the variant "top-level-only"
    Then task-decode-strict-fields: the api tests fail with a test assertion

  Scenario: A valid task with known nested fields still decodes
    Given task-decode-strict-fields: the api package is copied from this checkout and its tests pass on the real DecodeTask
    When task-decode-strict-fields: DecodeTask is replaced by the variant "reject-nested"
    Then task-decode-strict-fields: the api tests fail with a test assertion
