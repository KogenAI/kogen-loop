Feature: BusyBox killall applet refusal
  This feature checks that ForeignKill refuses the BusyBox killall applet with the pkill-killall rule, including behind ordinary command wrappers, without refusing other BusyBox uses or changing the existing rules.

  Background:
    Given foreign-kill-busybox-applet: the shell command filter is available

  Scenario: busybox killall is refused
    When foreign-kill-busybox-applet: the filter judges the command "busybox killall worker"
    Then foreign-kill-busybox-applet: the command is refused with the rule "pkill-killall"

  Scenario: busybox killall behind env is refused
    When foreign-kill-busybox-applet: the filter judges the command "env MODE=fast busybox killall worker"
    Then foreign-kill-busybox-applet: the command is refused with the rule "pkill-killall"

  Scenario: busybox killall behind sudo and timeout is refused
    When foreign-kill-busybox-applet: the filter judges the command "sudo timeout 5 /bin/busybox killall worker"
    Then foreign-kill-busybox-applet: the command is refused with the rule "pkill-killall"

  Scenario: busybox echo killall is allowed
    When foreign-kill-busybox-applet: the filter judges the command "busybox echo killall"
    Then foreign-kill-busybox-applet: the command is allowed

  Scenario: another busybox applet is allowed
    When foreign-kill-busybox-applet: the filter judges the command "busybox ls"
    Then foreign-kill-busybox-applet: the command is allowed

  Scenario: direct killall keeps the pkill-killall rule
    When foreign-kill-busybox-applet: the filter judges the command "killall worker"
    Then foreign-kill-busybox-applet: the command is refused with the rule "pkill-killall"

  Scenario: direct pkill keeps the pkill-killall rule
    When foreign-kill-busybox-applet: the filter judges the command "pkill -f worker"
    Then foreign-kill-busybox-applet: the command is refused with the rule "pkill-killall"

  Scenario: direct kill of a foreign pid keeps its rule
    When foreign-kill-busybox-applet: the filter judges the command "kill 1234"
    Then foreign-kill-busybox-applet: the command is refused with the rule "kill-foreign-pid"
