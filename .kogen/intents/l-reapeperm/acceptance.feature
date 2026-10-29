Feature: Deterministic gone-group decision inputs
  Scenario: Reused group permissions do not break the fixture
    When I run the gone-group decision test 200 times
    Then the gone-group decision command succeeds
    When I collect the deterministic gone-group case results 200 times
    Then these gone-group tests each passed 200 times:
      | TestLinuxTimeoutObservationDecisions/kill_EPERM_reused_pgid |
      | TestLinuxTimeoutObservationDecisions/kill_success          |
      | TestLinuxTimeoutObservationDecisions/kill_ESRCH_absent     |
