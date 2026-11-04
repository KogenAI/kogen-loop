Feature: Cut-read records survive a session resume
  A standalone session saves its cut read_file records (call id, root-relative path, omitted
  line range) in session.json as "cut_reads" and ResumeSession restores them, so a read in a
  resumed round, run in a new kogen-loop process, that delivers lines an earlier round's cut
  omitted carries "recovers" exactly as in one long session. A session.json without records
  resumes with none. Events carry no file path or text, and the request bodies and saved
  conversation stay byte-identical.

  Scenario: A resumed round recovers lines a cut in an earlier round omitted
    When l-cut-recovery-survives-resume: I run the scripted session "resumed", each round in a new process
    Then l-cut-recovery-survives-resume: every round ends with its finish call and exit code 0, every round after the first resumed
    And l-cut-recovery-survives-resume: the outputs delivered to the model are:
      """
      {"c-cut":{"file":"big.txt","lines":[[1,69],[404,600]],"marker":"[... 334 lines (70-403), 20618 bytes omitted ...]"},"c-straddle":{"file":"big.txt","lines":[[400,405]]},"c-recover":{"file":"big.txt","lines":[[100,109]]},"c-cut-2":{"file":"big.txt","lines":[[1,69],[404,600]],"marker":"[... 334 lines (70-403), 20618 bytes omitted ...]"},"c-both":{"file":"big.txt","lines":[[400,405]]}}
      """
    And l-cut-recovery-survives-resume: the event streams carry no file contents, file paths or raw call arguments
    And l-cut-recovery-survives-resume: the request bodies and saved conversation equal those of the same rounds with the saved records removed before each resume
    And l-cut-recovery-survives-resume: session.json after each round saves the records:
      """
      [[{"call_id":"c-cut","file":"big.txt","from":70,"to":403}],[{"call_id":"c-cut","file":"big.txt","from":70,"to":403},{"call_id":"c-cut-2","file":"big.txt","from":70,"to":403}],[{"call_id":"c-cut","file":"big.txt","from":70,"to":403},{"call_id":"c-cut-2","file":"big.txt","from":70,"to":403}]]
      """
    And l-cut-recovery-survives-resume: the tool events of each round add exactly:
      """
      [{"callEvents":{"c-cut":{},"end-1":{}},"results":{"c-cut":{"omitted_lines":[70,403]}},"cut":{"c-cut":true}},{"callEvents":{"c-straddle":{},"c-recover":{},"c-cut-2":{},"end-2":{}},"results":{"c-straddle":{"recovers":[{"call_id":"c-cut","lines":4}]},"c-recover":{"recovers":[{"call_id":"c-cut","lines":10}]},"c-cut-2":{"omitted_lines":[70,403]}},"cut":{"c-straddle":false,"c-recover":false,"c-cut-2":true}},{"callEvents":{"c-both":{},"end-3":{}},"results":{"c-both":{"recovers":[{"call_id":"c-cut","lines":4},{"call_id":"c-cut-2","lines":4}]}},"cut":{"c-both":false}}]
      """

  Scenario: Resumed reads of another file or outside the omitted lines are not recoveries
    When l-cut-recovery-survives-resume: I run the scripted session "unrelated", each round in a new process
    Then l-cut-recovery-survives-resume: every round ends with its finish call and exit code 0, every round after the first resumed
    And l-cut-recovery-survives-resume: the outputs delivered to the model are:
      """
      {"c-cut":{"file":"big.txt","lines":[[1,69],[404,600]],"marker":"[... 334 lines (70-403), 20618 bytes omitted ...]"},"c-other":{"file":"other.txt","lines":[[100,109]]},"c-before":{"file":"big.txt","lines":[[60,69]]},"c-after":{"file":"big.txt","lines":[[404,410]]}}
      """
    And l-cut-recovery-survives-resume: the event streams carry no file contents, file paths or raw call arguments
    And l-cut-recovery-survives-resume: the request bodies and saved conversation equal those of the same rounds with the saved records removed before each resume
    And l-cut-recovery-survives-resume: session.json after each round saves the records:
      """
      [[{"call_id":"c-cut","file":"big.txt","from":70,"to":403}],[{"call_id":"c-cut","file":"big.txt","from":70,"to":403}]]
      """
    And l-cut-recovery-survives-resume: the tool events of each round add exactly:
      """
      [{"callEvents":{"c-cut":{},"end-1":{}},"results":{"c-cut":{"omitted_lines":[70,403]}},"cut":{"c-cut":true}},{"callEvents":{"c-other":{},"c-before":{},"c-after":{},"end-2":{}},"results":{"c-other":{},"c-before":{},"c-after":{}},"cut":{"c-other":false,"c-before":false,"c-after":false}}]
      """

  Scenario: A session directory saved without records resumes with none
    When l-cut-recovery-survives-resume: I run the scripted session "old-format", each round in a new process, removing the saved records before each resume
    Then l-cut-recovery-survives-resume: every round ends with its finish call and exit code 0, every round after the first resumed
    And l-cut-recovery-survives-resume: the outputs delivered to the model are:
      """
      {"c-cut":{"file":"big.txt","lines":[[1,69],[404,600]],"marker":"[... 334 lines (70-403), 20618 bytes omitted ...]"},"c-straddle":{"file":"big.txt","lines":[[400,405]]}}
      """
    And l-cut-recovery-survives-resume: the event streams carry no file contents, file paths or raw call arguments
    And l-cut-recovery-survives-resume: session.json after each round saves the records:
      """
      [[{"call_id":"c-cut","file":"big.txt","from":70,"to":403}],[]]
      """
    And l-cut-recovery-survives-resume: the tool events of each round add exactly:
      """
      [{"callEvents":{"c-cut":{},"end-1":{}},"results":{"c-cut":{"omitted_lines":[70,403]}},"cut":{"c-cut":true}},{"callEvents":{"c-straddle":{},"end-2":{}},"results":{"c-straddle":{}},"cut":{"c-straddle":false}}]
      """
