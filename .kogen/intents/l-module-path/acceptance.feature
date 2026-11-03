Feature: Canonical public module identity

  Scenario: Report the public module path
    Then l-module-path: command "go list -m" succeeds with stdout "github.com/KogenAI/kogen-loop"

  Scenario: Remove the quoted bare prefix from every Go file
    Then l-module-path: no Go file contains the quoted bare prefix

  Scenario: Preserve existing behavior under the public path
    Then l-module-path: the existing build vet and test commands pass
