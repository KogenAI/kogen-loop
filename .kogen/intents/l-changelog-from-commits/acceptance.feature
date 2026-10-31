Feature: Record later kogen-loop changes in commit history instead of CHANGELOG.md

  Scenario: CHANGELOG.md says where later changes are recorded and keeps its history
    Then the changelog-from-commits CHANGELOG.md begins with exactly
      """
      # Changelog

      This file is no longer updated. Its entries end with commit `07f21da` (Continue runs within the request budget). Later changes, and earlier ones not listed below, are recorded in the commit history: each commit's subject and body state what changed, and a `Kogen-Intent: <slug>` trailer names the change's full description in `.kogen/intents/<slug>/intent.md`. List them with `git log`.

      ## v0.1.0 (unreleased)
      """
    And the changelog-from-commits CHANGELOG.md history from "## v0.1.0 (unreleased)" to the end has 10538 bytes and sha256 "3b30310ebfa2c0a30cd786f887c9a846e4a688063d69b2c7f8bc19ee8ee83e64"
    When I run the changelog-from-commits Go tests that read CHANGELOG.md
    Then the changelog-from-commits Go test "TestVersionMatchesChangelog" passed
    And the changelog-from-commits Go test "TestDropBoundsDocumentation" passed
    And the changelog-from-commits Go test "TestQueuedLeverCleanup" passed

  Scenario: README.md tells changes not to add a CHANGELOG.md entry
    Then the changelog-from-commits README.md contains "see the [CHANGELOG](CHANGELOG.md) for the unreleased v0.1.0 contents up to commit `07f21da`, and the commit history for later changes; `loop.Version` is `0.1.0-dev`."
    And the changelog-from-commits README.md contains "Changes are recorded in their commit messages, not in CHANGELOG.md: a change does not add a CHANGELOG.md entry; its commit subject and body state what changed."
    And the changelog-from-commits README.md does not contain "see the [CHANGELOG](CHANGELOG.md) for the unreleased v0.1.0 contents;"
