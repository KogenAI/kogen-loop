'use strict';
// Matches an observation against an expectation for L-CONDENSE-FAILED-USAGE. An expected
// object must have each of its keys in the observed object (other observed keys are ignored);
// an expected array must have exactly as many entries, matched in order; any other value must
// be strictly equal. Three single-key objects are operators: {"$re": p} matches a string the
// regular expression p matches, {"$gt": n} a number above n, {"$absent": true} a missing key.
// Run as a program it runs one observer control: node l_condense_failed_usage_match.js
// --control <library|cli> <good|bad>, printing "match" (exit 0) or the first mismatch (exit 1).
const OPERATORS = ['$re', '$gt', '$absent'];

function describe(v) { return v === undefined ? 'absent' : JSON.stringify(v); }

function operator(e) {
  if (e === null || typeof e !== 'object' || Array.isArray(e)) return undefined;
  const keys = Object.keys(e);
  return keys.length === 1 && OPERATORS.includes(keys[0]) ? keys[0] : undefined;
}

// mismatch is the first difference as "<path>: expected ..., got ...", or null.
function mismatch(expected, observed, at) {
  switch (operator(expected)) {
    case '$absent':
      return observed === undefined ? null : `${at}: expected absent, got ${describe(observed)}`;
    case '$re':
      return typeof observed === 'string' && new RegExp(expected.$re).test(observed) ? null
        : `${at}: expected a string matching /${expected.$re}/, got ${describe(observed)}`;
    case '$gt':
      return typeof observed === 'number' && observed > expected.$gt ? null
        : `${at}: expected a number above ${expected.$gt}, got ${describe(observed)}`;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(observed)) return `${at}: expected an array, got ${describe(observed)}`;
    if (observed.length !== expected.length) return `${at}: expected ${expected.length} entries, got ${observed.length}`;
    for (let i = 0; i < expected.length; i++) {
      const m = mismatch(expected[i], observed[i], `${at}[${i}]`);
      if (m) return m;
    }
    return null;
  }
  if (expected !== null && typeof expected === 'object') {
    if (observed === null || typeof observed !== 'object' || Array.isArray(observed)) return `${at}: expected an object, got ${describe(observed)}`;
    for (const k of Object.keys(expected)) {
      const m = mismatch(expected[k], observed[k], `${at}.${k}`);
      if (m) return m;
    }
    return null;
  }
  return Object.is(expected, observed) ? null : `${at}: expected ${describe(expected)}, got ${describe(observed)}`;
}

function check(observed, expected) {
  const m = mismatch(expected, observed, '$');
  if (m) throw new Error('mismatch at ' + m + '\nobservation: ' + JSON.stringify(observed));
}

module.exports = {mismatch, check};

// Observer controls (Feasibility). Each expectation is the one of the feature scenario named
// beside it. Each good observation was recorded from a reference implementation; each bad one
// is a plausible wrong implementation: the library set sums an unknown usage for the failed
// request, the cli set emits the failed condensation without its failed field.
const CONTROLS = {
  // Scenario: Chunk 1 is summarized, chunk 2 fails: ...
  library: {
    expected: {"summary_requests":2,"conversation_requests":0,"faults":[],
      "error":{"class":"provider","reason":"refused","detail":"ChatGPT refused the request: 400 fixture failure"},
      "disclosures":[{"Failed":true,"Requests":2,
        "Usage":{"input":100,"cached":10,"output":20,"reasoning":5,"state":"complete","source":"provider"},
        "CondensedExchanges":0,"KeptExchanges":0,"BytesBefore":721899,"BytesAfter":0,"Limit":524288,"SummaryBytes":0}]},
    good: {"conversation_requests":0,"disclosures":[{"Requests":2,"CondensedExchanges":0,"KeptExchanges":0,"BytesBefore":721899,"BytesAfter":0,"Limit":524288,"SummaryBytes":0,"Usage":{"input":100,"cached":10,"output":20,"reasoning":5,"state":"complete","source":"provider"},"Failed":true}],"error":{"class":"provider","detail":"ChatGPT refused the request: 400 fixture failure","reason":"refused"},"faults":[],"summary_requests":2},
    bad: {"conversation_requests":0,"disclosures":[{"Requests":2,"CondensedExchanges":0,"KeptExchanges":0,"BytesBefore":721899,"BytesAfter":0,"Limit":524288,"SummaryBytes":0,"Usage":{"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown","source":"provider"},"Failed":true}],"error":{"class":"provider","detail":"ChatGPT refused the request: 400 fixture failure","reason":"refused"},"faults":[],"summary_requests":2},
  },
  // Scenario: The CLI emits a failed context.condensed event before the unchanged refusal
  cli: {
    expected: {"exit":1,"summary_requests":1,"conversation_requests":5,"faults":[],
      "events":[
        {"type":"context.condensed","n":6,"failed":true,"requests":1,
          "usage":{"input":64,"cached":0,"output":3,"reasoning":0,"state":"complete","source":"provider"},
          "condensed_exchanges":0,"kept_exchanges":0,"bytes_before":{"$gt":524288},"bytes_after":0,"limit":524288,"summary_bytes":0},
        {"type":"error","class":"loop","reason":"context_budget_exceeded",
          "detail":{"$re":"^loop: complete next request [0-9]+ bytes exceeds 524288; reserve 131072 tokens\\. Condensation could not reduce it: the summarization request returned no summary\\. The request was not sent and nothing was clipped\\.$"}},
        {"type":"session.ended","status":"failed","exit":1}]},
    good: {"exit":1,"summary_requests":1,"conversation_requests":5,"faults":[],"events":[{"bytes_after":0,"bytes_before":602492,"condensed_exchanges":0,"failed":true,"kept_exchanges":0,"limit":524288,"n":6,"requests":1,"summary_bytes":0,"type":"context.condensed","usage":{"input":64,"cached":0,"output":3,"reasoning":0,"state":"complete","source":"provider"}},{"class":"loop","detail":"loop: complete next request 481691 bytes exceeds 524288; reserve 131072 tokens. Condensation could not reduce it: the summarization request returned no summary. The request was not sent and nothing was clipped.","reason":"context_budget_exceeded","type":"error"},{"exit":1,"status":"failed","type":"session.ended"}]},
    bad: {"exit":1,"summary_requests":1,"conversation_requests":5,"faults":[],"events":[{"bytes_after":0,"bytes_before":602492,"condensed_exchanges":0,"kept_exchanges":0,"limit":524288,"n":6,"requests":1,"summary_bytes":0,"type":"context.condensed","usage":{"input":64,"cached":0,"output":3,"reasoning":0,"state":"complete","source":"provider"}},{"class":"loop","detail":"loop: complete next request 481691 bytes exceeds 524288; reserve 131072 tokens. Condensation could not reduce it: the summarization request returned no summary. The request was not sent and nothing was clipped.","reason":"context_budget_exceeded","type":"error"},{"exit":1,"status":"failed","type":"session.ended"}]},
  },
};

if (require.main === module) {
  const [flag, name, which] = process.argv.slice(2);
  const set = CONTROLS[name];
  if (flag !== '--control' || !set || !['good', 'bad'].includes(which)) {
    process.stdout.write('usage: l_condense_failed_usage_match.js --control <library|cli> <good|bad>\n');
    process.exit(2);
  }
  const m = mismatch(set.expected, set[which], '$');
  if (m) {
    process.stdout.write('mismatch at ' + m + '\n');
    process.exit(1);
  }
  process.stdout.write('match\n');
}
