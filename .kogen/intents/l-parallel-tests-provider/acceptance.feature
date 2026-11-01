Feature: Safe default parallel provider tests
  Scenario: Independent provider tests use Go parallel scheduling
    When I execute the uncached provider parallel suite
    Then the provider suite passes with default parallel scheduling
