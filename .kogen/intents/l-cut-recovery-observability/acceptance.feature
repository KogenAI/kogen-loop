Feature: The event log ties a read that recovers cut lines to the cut read
  A standalone session's tool.result event of a cut read_file result gains "omitted_lines"
  (the first and last omitted line numbers), and a later read_file of the same file that
  delivers some of those lines gains "recovers" (the cut call's id and how many omitted lines
  it delivered). Reads of other files, reads outside the omitted lines and reads after an
  uncut result carry neither. No file contents, paths or raw call arguments reach the event
  stream; existing fields such as the usage.output token count stay; everything the model
  receives is unchanged.

  Scenario: A read covering omitted lines is recorded as recovering the cut call
    When l-cut-recovery-observability: I run the scripted session "recovery"
    Then l-cut-recovery-observability: the session ends with the finish call and exit code 0
    And l-cut-recovery-observability: the outputs delivered to the model are:
      """
      {"c-cut":{"file":"big.txt","lines":[[1,69],[404,600]],"marker":"[... 334 lines (70-403), 20618 bytes omitted ...]"},"c-recover":{"file":"big.txt","lines":[[100,109]]},"c-straddle":{"file":"big.txt","lines":[[400,405]]}}
      """
    And l-cut-recovery-observability: the event stream carries no file contents, file paths or raw call arguments
    And l-cut-recovery-observability: the tool events add exactly:
      """
      {"callEvents":{"c-cut":{},"c-recover":{},"c-straddle":{},"end":{}},"results":{"c-cut":{"omitted_lines":[70,403]},"c-recover":{"recovers":[{"call_id":"c-cut","lines":10}]},"c-straddle":{"recovers":[{"call_id":"c-cut","lines":4}]}},"cut":{"c-cut":true,"c-recover":false,"c-straddle":false}}
      """

  Scenario: Reads of another file, outside the omitted lines or after an uncut result are not recoveries
    When l-cut-recovery-observability: I run the scripted session "unrelated"
    Then l-cut-recovery-observability: the session ends with the finish call and exit code 0
    And l-cut-recovery-observability: the outputs delivered to the model are:
      """
      {"c-cut":{"file":"big.txt","lines":[[1,69],[404,600]],"marker":"[... 334 lines (70-403), 20618 bytes omitted ...]"},"c-other":{"file":"other.txt","lines":[[100,109]]},"c-before":{"file":"big.txt","lines":[[60,69]]},"c-after":{"file":"big.txt","lines":[[404,410]]},"c-small":{"file":"small.txt","lines":[[1,5]]},"c-small-again":{"file":"small.txt","lines":[[2,3]]}}
      """
    And l-cut-recovery-observability: the event stream carries no file contents, file paths or raw call arguments
    And l-cut-recovery-observability: the tool events add exactly:
      """
      {"callEvents":{"c-cut":{},"c-other":{},"c-before":{},"c-after":{},"c-small":{},"c-small-again":{},"end":{}},"results":{"c-cut":{"omitted_lines":[70,403]},"c-other":{},"c-before":{},"c-after":{},"c-small":{},"c-small-again":{}},"cut":{"c-cut":true,"c-other":false,"c-before":false,"c-after":false,"c-small":false,"c-small-again":false}}
      """
