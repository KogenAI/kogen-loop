Feature: Public tree holds no private paths in committed Intent records

  Scenario: The landed public-readiness acceptance passes without changing its check
    Given l-public-tree-private-paths: these files have these sha256 digests:
      | file                                              | sha256                                                           |
      | features/steps/l_public_ready.js                  | c957d756d7a41d61a43feee2242f5cb0179a68ac2ef48b3e75eca5a4c0362673 |
      | .kogen/intents/l-public-ready/acceptance.feature  | 5d90302c8f56ef3a4abf3095ae7ca918ab44cdfcbf5241c8d0a4b3e6fe3bebfd |
      | features/steps/standalone_loop.js                 | e518d4409e1f985703a661009b4033ee5507b52b61b8259cf76454fc86abfbcb |
      | features/steps/l_parallel_tests_sys.js            | 8722241d3acdeca525f9169b7afb6b74be89cf199a6f3909ee9bb9b4e8a6b74c |
    When l-public-tree-private-paths: I run the acceptance feature ".kogen/intents/l-public-ready/acceptance.feature" with only the step file "features/steps/l_public_ready.js"
    Then l-public-tree-private-paths: that run reports these scenario results:
      | scenario                                            | steps | result |
      | A public reader can start from the README           | 2     | passed |
      | Public documentation has no local identity residues | 2     | passed |
      | The owner receives a historical inventory           | 2     | passed |
    And l-public-tree-private-paths: that run exits with status 0

  Scenario: The consumer-contract Intent record names its mirrors with a neutral placeholder
    Then l-public-tree-private-paths: ".kogen/intents/l-consumes-contract/intent.md" has exactly one line starting with "Consumer sources, for reading the cases to adapt:", and that line is:
      """
      Consumer sources, for reading the cases to adapt: Shape read them from local mirrors with `git --git-dir=<mirrors>/<consumer>.git show <commit>:<path>`. Acceptance does not use these mirrors, and the suite must not read them.
      """
    And l-public-tree-private-paths: ".kogen/intents/l-consumes-contract/intent.md" has no home path, runner host or personal name
    And l-public-tree-private-paths: these files have these sha256 digests:
      | file                                         | sha256                                                           |
      | .kogen/intents/l-consumes-contract/intent.md | 7df24fbacc6a7ab34c476dfde3c60e29ec9744ffde4ee339190faeff9117b4cb |
