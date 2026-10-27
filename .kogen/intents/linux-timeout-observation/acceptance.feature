Feature: Linux timeout observation source qualification
  Scenario Outline: Execute the production composition on Darwin
    When I qualify Linux timeout decisions with umask "<mask>"
    Then these Linux timeout decision rows pass exactly once:
      """
      ["live","zombie","synthetic-zombie","vanished","eperm","eacces","error-before-member","malformed","listing","guard-1","guard-0","guard-negative"]
      """
    Examples:
      | mask |
      | 077  |
      | 022  |

  Scenario Outline: Stop genuine zombie-held timeout custody
    Given timeout custody inputs are:
      """
      {"mode":"<mode>","fault":false,"actor":"zombie"}
      """
    When I exercise timeout custody with umask "<mask>"
    Then timeout custody reports exactly:
      """
      {"error":"<error>","timedOut":false,"text":"","published":0,"requests":1,"ending":"","laterEffect":false,"returnedInput":false,"faultHeld":false,"leaderGone":true,"actorGone":true,"prompt":true,"held":true,"escaped":false}
      """
    Examples:
      | mode      | error                    | mask |
      | cancel    | context.Canceled         | 077  |
      | deadline  | context.DeadlineExceeded  | 077  |
      | interrupt | interrupted SIGINT       | 077  |
      | cancel    | context.Canceled         | 022  |
      | deadline  | context.DeadlineExceeded  | 022  |
      | interrupt | interrupted SIGINT       | 022  |

  Scenario Outline: Return ordinary no-context timeout only after reap
    Given timeout custody inputs are:
      """
      {"mode":"direct","fault":false,"actor":"zombie"}
      """
    When I exercise timeout custody with umask "<mask>"
    Then timeout custody reports exactly:
      """
      {"error":"","timedOut":true,"text":"partial\n","published":0,"requests":0,"ending":"","laterEffect":false,"returnedInput":false,"faultHeld":false,"leaderGone":true,"actorGone":true,"prompt":true,"held":true,"escaped":false}
      """
    Examples:
      | mask |
      | 077  |
      | 022  |

  Scenario: Compile Linux runtime regressions and supported targets
    When I cross-compile Linux timeout qualification
    Then Linux runtime proof remains pending and these targets compiled:
      """
      ["linux/amd64","linux/arm64","darwin/amd64","darwin/arm64","freebsd/amd64","freebsd/arm64"]
      """

  Scenario: Preserve the selected source-only boundary
    When I inspect Linux timeout preservation and documentation
    Then the Linux timeout preservation digest is "fde493b4a670acb0eb45344306f99449529c097c990f631450965e8283bf30a3"
