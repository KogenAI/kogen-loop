Feature: ForeignKill inspects find -exec and -execdir actions
  This feature checks that ForeignKill judges the command run by a find -exec or -execdir action with the existing rules, whether the action ends with an escaped semicolon or with plus, and that a find without a process-stopping action stays allowed.

  Background:
    Given foreign-kill-find-exec-actions: the shell command filter is available

  Scenario: find -exec killall ended by an escaped semicolon is refused
    When foreign-kill-find-exec-actions: the filter judges the command "find . -exec killall worker \;"
    Then foreign-kill-find-exec-actions: the command is refused with the rule "pkill-killall"

  Scenario: find -execdir kill of a foreign pid is refused
    When foreign-kill-find-exec-actions: the filter judges the command "find . -execdir kill -9 1234 \;"
    Then foreign-kill-find-exec-actions: the command is refused with the rule "kill-foreign-pid"

  Scenario: find -exec killall ended by plus is refused
    When foreign-kill-find-exec-actions: the filter judges the command "find . -exec killall worker +"
    Then foreign-kill-find-exec-actions: the command is refused with the rule "pkill-killall"

  Scenario: find -execdir kill of a foreign pid ended by plus is refused
    When foreign-kill-find-exec-actions: the filter judges the command "find . -execdir kill 1234 +"
    Then foreign-kill-find-exec-actions: the command is refused with the rule "kill-foreign-pid"

  Scenario: find -exec kill of an owned pid is allowed
    When foreign-kill-find-exec-actions: the filter judges the command "find . -exec kill 4242 \;"
    Then foreign-kill-find-exec-actions: the command is allowed

  Scenario: find without an action is allowed
    When foreign-kill-find-exec-actions: the filter judges the command "find . -name '*.log' -print"
    Then foreign-kill-find-exec-actions: the command is allowed

  Scenario: find -exec of a harmless command that only names killall is allowed
    When foreign-kill-find-exec-actions: the filter judges the command "find . -exec echo killall \;"
    Then foreign-kill-find-exec-actions: the command is allowed

  Scenario: find -execdir of a harmless command ended by plus is allowed
    When foreign-kill-find-exec-actions: the filter judges the command "find . -execdir ls {} +"
    Then foreign-kill-find-exec-actions: the command is allowed

  Scenario: direct killall keeps the pkill-killall rule
    When foreign-kill-find-exec-actions: the filter judges the command "killall worker"
    Then foreign-kill-find-exec-actions: the command is refused with the rule "pkill-killall"
