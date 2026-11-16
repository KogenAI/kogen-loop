Feature: Treat standalone help as successful usage
  This feature exercises the built CLI offline, without providers or credentials.
  The successful invocations are kogen-loop --help, kogen-loop -h and kogen-loop help.
  The supplied rejected invocations include kogen-loop help extra and kogen-loop --help extra.

  Background:
    Given kogen-loop-help-prints-usage: the CLI is built from this checkout

  Scenario: Long help prints usage
    When kogen-loop-help-prints-usage: I invoke the CLI with arguments:
      """
      ["--help"]
      """
    Then kogen-loop-help-prints-usage: the process result is exactly:
      """
      {"exit":0,"stdout":"usage: kogen-loop capabilities --json | version | run --task FILE|-\n","stderr":""}
      """
    And kogen-loop-help-prints-usage: the package comment names the help form "kogen-loop --help"

  Scenario: Short help prints usage
    When kogen-loop-help-prints-usage: I invoke the CLI with arguments:
      """
      ["-h"]
      """
    Then kogen-loop-help-prints-usage: the process result is exactly:
      """
      {"exit":0,"stdout":"usage: kogen-loop capabilities --json | version | run --task FILE|-\n","stderr":""}
      """

  Scenario: Help command prints usage
    When kogen-loop-help-prints-usage: I invoke the CLI with arguments:
      """
      ["help"]
      """
    Then kogen-loop-help-prints-usage: the process result is exactly:
      """
      {"exit":0,"stdout":"usage: kogen-loop capabilities --json | version | run --task FILE|-\n","stderr":""}
      """

  Scenario: Help with extra arguments stays invalid
    When kogen-loop-help-prints-usage: I invoke the CLI with arguments:
      """
      ["help","extra"]
      """
    Then kogen-loop-help-prints-usage: the process result is exactly:
      """
      {"exit":2,"stdout":"","stderr":"usage: kogen-loop capabilities --json | version | run --task FILE|-\n"}
      """

  Scenario: Long help with extra arguments stays invalid
    When kogen-loop-help-prints-usage: I invoke the CLI with arguments:
      """
      ["--help","extra"]
      """
    Then kogen-loop-help-prints-usage: the process result is exactly:
      """
      {"exit":2,"stdout":"","stderr":"usage: kogen-loop capabilities --json | version | run --task FILE|-\n"}
      """

  Scenario: Short help with extra arguments stays invalid
    When kogen-loop-help-prints-usage: I invoke the CLI with arguments:
      """
      ["-h","extra"]
      """
    Then kogen-loop-help-prints-usage: the process result is exactly:
      """
      {"exit":2,"stdout":"","stderr":"usage: kogen-loop capabilities --json | version | run --task FILE|-\n"}
      """

  Scenario: No argument stays invalid
    When kogen-loop-help-prints-usage: I invoke the CLI with arguments:
      """
      []
      """
    Then kogen-loop-help-prints-usage: the process result is exactly:
      """
      {"exit":2,"stdout":"","stderr":"usage: kogen-loop capabilities --json | version | run --task FILE|-\n"}
      """

  Scenario: Unknown command stays invalid
    When kogen-loop-help-prints-usage: I invoke the CLI with arguments:
      """
      ["bogus"]
      """
    Then kogen-loop-help-prints-usage: the process result is exactly:
      """
      {"exit":2,"stdout":"","stderr":"usage: kogen-loop capabilities --json | version | run --task FILE|-\n"}
      """

  Scenario: Version output stays unchanged
    When kogen-loop-help-prints-usage: I invoke the CLI with arguments:
      """
      ["version"]
      """
    Then kogen-loop-help-prints-usage: the process result is exactly:
      """
      {"exit":0,"stdout":"kogen-loop dev\n","stderr":""}
      """
