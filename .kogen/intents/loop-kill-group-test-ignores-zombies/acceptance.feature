Feature: The kill-group contract tests treat an unreaped zombie as gone

  This feature drives the contract package's own waitGone helper on real process groups.

  Scenario: A group whose only member is an unreaped zombie counts as gone
    Given loop-kill-group-test-ignores-zombies: the contract tests define the group helper waitGone
    When loop-kill-group-test-ignores-zombies: the helper waits for a group whose only member is an unreaped zombie
    Then loop-kill-group-test-ignores-zombies: the helper returns within 2 seconds with no failure

  Scenario: A group with a running member still remains
    Given loop-kill-group-test-ignores-zombies: the contract tests define the group helper waitGone
    When loop-kill-group-test-ignores-zombies: the helper waits for a group with a running member
    Then loop-kill-group-test-ignores-zombies: the helper fails with its remains message

  Scenario: A group that vanishes entirely still counts as gone
    Given loop-kill-group-test-ignores-zombies: the contract tests define the group helper waitGone
    When loop-kill-group-test-ignores-zombies: the timed-out and interrupted group tests run and the helper waits for a vanished group
    Then loop-kill-group-test-ignores-zombies: both existing tests pass and the vanished group counts as gone within 2 seconds
