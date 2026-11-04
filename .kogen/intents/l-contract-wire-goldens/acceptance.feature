Feature: l-contract-wire-goldens: Own provider wire goldens
  Scenario: Consumer bodies have a committed local golden
    Then l-contract-wire-goldens: the fixture "contract/testdata/loop_knobs_golden.json" is readable

  Scenario: Provider consumer contracts run in isolation from shell custody
    Then l-contract-wire-goldens: the command "go test ./contract -run Provider -count=1" succeeds
