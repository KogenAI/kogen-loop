Feature: Correct the recommended ChatGPT review default
  Scenario: Public provider listing text recommends Terra medium
    When I read the L review default public provider text
    Then the L review default recommendation line is exactly
      """
      Recommended ChatGPT defaults: Shape gpt-6.1-sol/high, Build gpt-6.1-sol/medium, Review gpt-6.1-terra/medium (omitted roles keep these defaults).
      """
