Feature: Public repository documentation
  Scenario: A public reader can start from the README
    Then the public README contains each required item
      """json
      ["kogen-loop","Go 1.27.2","go build -o bin/kogen-loop ./cmd/kogen-loop","capabilities --json","go test","go vet","https://github.com/KogenAI/kogen","contact@kogen.dev"]
      """
    And the public README states the inquiry address exactly 1 time

  Scenario: Public documentation has no local identity residues
    Then tracked public documentation has no private identity or setup residues
    And the public tree has none of these policy files
      """json
      ["SECURITY.md","CONTRIBUTING.md","BRANDING.md"]
      """

  Scenario: The owner receives a historical inventory
    Then the public historical audit contains each required item
      """json
      ["commit","file","category","history","owner"]
      """
    And the historical audit identifies at least one full commit
