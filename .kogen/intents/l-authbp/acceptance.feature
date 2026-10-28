Feature: Optional Anthropic authority cache breakpoint
  Scenario Outline: Provider contract behavior
    When I run the authority breakpoint test "<test>"
    Then that authority breakpoint test must have passed
    Examples:
      | test                                  |
      | TestAuthorityBreakpointDefault        |
      | TestAuthorityBreakpointEnabled        |
      | TestAuthorityBreakpointBoundaries     |
      | TestAuthorityBreakpointLimit          |
      | TestAuthorityBreakpointOtherRoutes    |
