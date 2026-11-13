Feature: Obsolete provider and cache compatibility is removed
  This feature checks that provider selection is explicit and that no obsolete wording remains.

  Scenario: An omitted provider is refused
    When simplify-loop-obsolete-provider-cache: the built CLI runs a task with provider ""
    Then simplify-loop-obsolete-provider-cache: the CLI refuses with exit 2 and "unknown provider"

  Scenario: An invalid provider is refused
    When simplify-loop-obsolete-provider-cache: the built CLI runs a task with provider "nobody"
    Then simplify-loop-obsolete-provider-cache: the CLI refuses with exit 2 and "unknown provider nobody"

  Scenario: No obsolete wording remains
    When simplify-loop-obsolete-provider-cache: the repository is searched for obsolete provider and cache wording
    Then simplify-loop-obsolete-provider-cache: the search finds no match
