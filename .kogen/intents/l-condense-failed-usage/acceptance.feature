Feature: A failed history condensation reports what it spent
  An over-budget request is condensed by summarization requests before it is sent. When
  condensation fails after it has sent at least one summarization request, loop.Direct tells
  its Condensed callback once, before returning the unchanged error, with Failed true, the
  number of summarization requests sent and the summed usage of the summarization responses
  received; a session emits that disclosure as a context.condensed event with "failed": true.
  A successful condensation is disclosed as before (Failed false, no "failed" event field) and
  a request that fits sends no summarization request and discloses nothing.

  The library scenarios run loop.Direct.Request (owner "acceptance", chatgpt fixture-model,
  524288-byte window) on a task and 8 complete read_file exchanges whose outputs carry 90000
  filler bytes each (3 exchanges of 100 bytes for the history that fits), over a local fake
  ChatGPT Responses server: its folding needs two summarization chunks. The CLI scenarios run
  the real kogen-loop CLI, whose 6th request carries 5 exchanges with 120000-byte call
  arguments each and so needs one summarization request.

  Scenario: Chunk 1 is summarized, chunk 2 fails: the failure discloses 2 requests and the chunk-1 usage
    When loop.Direct sends an over-budget history whose summarization requests are answered:
      """
      {"exchanges":8,"pad":90000,"summaries":[
        {"text":"SUMMARY ONE covers FACT-001 to FACT-005","usage":{"input_tokens":100,"input_tokens_details":{"cached_tokens":10},"output_tokens":20,"output_tokens_details":{"reasoning_tokens":5}}},
        {"status":400}]}
      """
    Then the condensation observation matches:
      """
      {"summary_requests":2,"conversation_requests":0,"faults":[],
       "error":{"class":"provider","reason":"refused","detail":"ChatGPT refused the request: 400 fixture failure"},
       "disclosures":[{"Failed":true,"Requests":2,
         "Usage":{"input":100,"cached":10,"output":20,"reasoning":5,"state":"complete","source":"provider"},
         "CondensedExchanges":0,"KeptExchanges":0,"BytesBefore":721899,"BytesAfter":0,"Limit":524288,"SummaryBytes":0}]}
      """

  Scenario: An empty summary discloses 1 request and its usage, and the refusal wording is unchanged
    When loop.Direct sends an over-budget history whose summarization requests are answered:
      """
      {"exchanges":8,"pad":90000,"summaries":[
        {"text":"  ","usage":{"input_tokens":64,"input_tokens_details":{"cached_tokens":0},"output_tokens":3,"output_tokens_details":{"reasoning_tokens":0}}}]}
      """
    Then the condensation observation matches:
      """
      {"summary_requests":1,"conversation_requests":0,"faults":[],
       "error":{"class":"loop","reason":"context_budget_exceeded",
         "detail":{"$re":"^acceptance: complete next request [0-9]+ bytes exceeds 524288; reserve 131072 tokens\\. Condensation could not reduce it: the summarization request returned no summary\\. The request was not sent and nothing was clipped\\.$"}},
       "disclosures":[{"Failed":true,"Requests":1,
         "Usage":{"input":64,"cached":0,"output":3,"reasoning":0,"state":"complete","source":"provider"},
         "CondensedExchanges":0,"KeptExchanges":0,"BytesBefore":721899,"BytesAfter":0,"Limit":524288,"SummaryBytes":0}]}
      """

  Scenario: A successful condensation is disclosed as before and is not marked failed
    When loop.Direct sends an over-budget history whose summarization requests are answered:
      """
      {"exchanges":8,"pad":90000,"summaries":[
        {"text":"SUMMARY ONE","usage":{"input_tokens":100,"input_tokens_details":{"cached_tokens":10},"output_tokens":20,"output_tokens_details":{"reasoning_tokens":5}}},
        {"text":"SUMMARY TWO","usage":{"input_tokens":200,"input_tokens_details":{"cached_tokens":30},"output_tokens":40,"output_tokens_details":{"reasoning_tokens":7}}}]}
      """
    Then the condensation observation matches:
      """
      {"summary_requests":2,"conversation_requests":1,"faults":[],"error":null,
       "disclosures":[{"Failed":false,"Requests":2,
         "Usage":{"input":300,"cached":40,"output":60,"reasoning":12,"state":"complete","source":"provider"},
         "CondensedExchanges":7,"KeptExchanges":1,"BytesBefore":721899,"BytesAfter":90827,"Limit":524288,"SummaryBytes":11}]}
      """

  Scenario: A history that fits sends no summarization request and discloses nothing
    When loop.Direct sends an over-budget history whose summarization requests are answered:
      """
      {"exchanges":3,"pad":100,"summaries":[]}
      """
    Then the condensation observation matches:
      """
      {"summary_requests":0,"conversation_requests":1,"faults":[],"error":null,"disclosures":[]}
      """

  Scenario: The CLI emits a failed context.condensed event before the unchanged refusal
    When the kogen-loop CLI grows its history past the input window with summarization answered:
      """
      {"reads":5,"pad":120000,"summaries":[
        {"text":"  ","usage":{"input_tokens":64,"input_tokens_details":{"cached_tokens":0},"output_tokens":3,"output_tokens_details":{"reasoning_tokens":0}}}]}
      """
    Then the condensation observation matches:
      """
      {"exit":1,"summary_requests":1,"conversation_requests":5,"faults":[],
       "events":[
         {"type":"context.condensed","n":6,"failed":true,"requests":1,
          "usage":{"input":64,"cached":0,"output":3,"reasoning":0,"state":"complete","source":"provider"},
          "condensed_exchanges":0,"kept_exchanges":0,"bytes_before":{"$gt":524288},"bytes_after":0,"limit":524288,"summary_bytes":0},
         {"type":"error","class":"loop","reason":"context_budget_exceeded",
          "detail":{"$re":"^loop: complete next request [0-9]+ bytes exceeds 524288; reserve 131072 tokens\\. Condensation could not reduce it: the summarization request returned no summary\\. The request was not sent and nothing was clipped\\.$"}},
         {"type":"session.ended","status":"failed","exit":1}]}
      """

  Scenario: The CLI discloses a successful condensation as before, without a failed field
    When the kogen-loop CLI grows its history past the input window with summarization answered:
      """
      {"reads":5,"pad":120000,"summaries":[
        {"text":"SUMMARY","usage":{"input_tokens":100,"input_tokens_details":{"cached_tokens":10},"output_tokens":20,"output_tokens_details":{"reasoning_tokens":5}}}]}
      """
    Then the condensation observation matches:
      """
      {"exit":0,"summary_requests":1,"conversation_requests":6,"faults":[],
       "events":[
         {"type":"context.condensed","n":6,"failed":{"$absent":true},"requests":1,
          "usage":{"input":100,"cached":10,"output":20,"reasoning":5,"state":"complete","source":"provider"},
          "condensed_exchanges":4,"kept_exchanges":1,"bytes_before":{"$gt":524288},"limit":524288,"summary_bytes":7},
         {"type":"round.ended","ending":"terminal","terminal_tool":"finish","requests":6},
         {"type":"session.ended","status":"ended","exit":0}]}
      """
