'use strict';
// Acceptance driver of fix-l-contract-wire-goldens: it runs the real
// `go test ./contract -run <filter> -count=1 -v` for TestProviderWireGoldens, either in the
// working tree or in a scratch copy of the module whose contract/testdata/loop_knobs_golden.json
// the scenario edits, and observes the run's result, its subtest results and its test messages
// (the text after each "<file>.go:<line>: " prefix, in output order).
// `node features/steps/fix-l-contract-wire-goldens__gate.js --control good|bad` checks the
// observer on real go test output of a stub TestProviderWireGoldens that reports chosen messages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const TEST = 'TestProviderWireGoldens';
const GOLDEN = 'contract/testdata/loop_knobs_golden.json';

// copyModule copies the working tree, without .git, into a fresh temporary directory.
function copyModule() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-goldens-'));
  fs.cpSync(process.cwd(), dir, {recursive:true, filter:src => path.relative(process.cwd(), src) !== '.git'});
  return dir;
}

// editGolden applies edit to the decoded golden fixture of the copy and writes it back.
function editGolden(dir, edit) {
  const file = path.join(dir, GOLDEN);
  const golden = JSON.parse(fs.readFileSync(file, 'utf8'));
  edit(golden);
  fs.writeFileSync(file, JSON.stringify(golden, null, 2) + '\n');
}

// locate resolves a dotted member path such as "messages.0.content.0.text" inside a case.
function locate(golden, key, member) {
  assert.ok(Object.hasOwn(golden, key), 'the golden fixture has no case ' + key);
  const parts = member.split('.');
  let parent = golden[key];
  for (const part of parts.slice(0, -1)) {
    assert.ok(parent !== null && typeof parent === 'object' && Object.hasOwn(parent, part), `case ${key} has no ${member}`);
    parent = parent[part];
  }
  const last = parts[parts.length - 1];
  assert.ok(parent !== null && typeof parent === 'object', `case ${key} has no ${member}`);
  return {parent, last};
}

function command(filter) { return `go test ./contract -run '${filter}' -count=1 -v`; }

// runGolden runs the real go test command in dir and returns its exit status and combined output.
function runGolden(dir, filter, env) {
  const r = spawnSync('go', ['test', './contract', '-run', filter, '-count=1', '-v'],
    {cwd:dir, env:{...process.env, ...env}, encoding:'utf8', maxBuffer:64 << 20});
  if (r.error) throw r.error;
  return {command:command(filter), dir, status:r.status, output:(r.stdout || '') + (r.stderr || '')};
}

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// summarize turns a run into its outcome: result PASS or FAIL (both the exit status and the
// "--- PASS/FAIL: TestProviderWireGoldens (" line must agree, otherwise UNKNOWN), the passing
// and failing subtest names in output order and every test message in output order.
function summarize(run) {
  const lines = run.output.split('\n');
  const parent = new RegExp(`^--- (PASS|FAIL): ${escape(TEST)} \\(`);
  const sub = new RegExp(`^\\s*--- (PASS|FAIL): ${escape(TEST)}/(\\S+) \\(`);
  const verdicts = lines.map(l => l.match(parent)).filter(Boolean).map(m => m[1]);
  let result = 'UNKNOWN';
  if (verdicts.length === 1 && verdicts[0] === 'PASS' && run.status === 0) result = 'PASS';
  if (verdicts.length === 1 && verdicts[0] === 'FAIL' && run.status !== 0) result = 'FAIL';
  const subs = lines.map(l => l.match(sub)).filter(Boolean);
  return {
    result,
    passing:subs.filter(m => m[1] === 'PASS').length,
    failing:subs.filter(m => m[1] === 'FAIL').map(m => m[2]),
    messages:lines.map(l => l.match(/^\s+[\w.-]+\.go:\d+: (.*)$/)).filter(Boolean).map(m => m[1]),
  };
}

// ran is the first line of a failure: the test name, the command, its exit status and the
// test's own "--- PASS/FAIL: TestProviderWireGoldens (" line and package result line, or that
// the test did not run.
function ran(run) {
  const lines = run.output.split('\n');
  const verdict = lines.find(l => new RegExp(`^--- (PASS|FAIL): ${escape(TEST)} \\(`).test(l));
  const pkg = lines.find(l => /^(ok|FAIL)\s+\S+\/contract\b/.test(l));
  const outcome = verdict ? `${TEST} ran: "${verdict.trim()}"` : `${TEST} did not run (no "--- PASS/FAIL: ${TEST} (" line)`;
  return `${outcome}; \`${run.command}\` exited ${run.status}${pkg ? `; "${pkg.trim()}"` : ''}`;
}

// verify checks a run against the expected outcome, naming the test, the command and the output.
function verify(run, want) {
  const got = summarize(run);
  assert.deepEqual(got, want, `${ran(run)}\nobserved ${JSON.stringify(got)}\nexpected ${JSON.stringify(want)}\n${run.output}`);
}

// EXPECTED repeats the feature's expectations for the observer controls (--control good|bad).
const ROUTES = ['chatgpt', 'supergrok', 'anthropic', 'anthropic-profile', 'opencode-go', 'openai-compatible'];
const KEYS = ROUTES.flatMap(r => [`baseline/${r}`, `tools/${r}/tools=false`, `tools/${r}/tools=true`]);
const EXPECTED = {
  stale:{filter:`^${TEST}$`, want:{result:'FAIL', passing:18, failing:[], messages:[
    'stale golden key baseline/retired is not visited by any route or variant',
    'stale golden key tools/chatgpt/tools=auto is not visited by any route or variant']}},
  nested:{filter:`^${TEST}$`, want:{result:'FAIL', passing:17, failing:['baseline/anthropic'], messages:[
    'baseline/anthropic body differs at $.messages[0].content[0].text: got "hi", want "bye"']}},
  first:{filter:`^${TEST}$`, want:{result:'FAIL', passing:17, failing:['baseline/chatgpt'], messages:[
    'baseline/chatgpt body differs at $.include: got ["reasoning.encrypted_content"], want <missing>']}},
  missing:{filter:`^${TEST}$`, want:{result:'FAIL', passing:16, failing:['tools/supergrok/tools=true', 'tools/anthropic/tools=false'], messages:[
    'tools/supergrok/tools=true body differs at $.tools[1]: got {"description":"d","name":"submit","parameters":{"type":"object"},"type":"function"}, want <missing>',
    'tools/anthropic/tools=false body differs at $.metadata: got <missing>, want {"user_id":"x"}']}},
  committed:{filter:`^${TEST}$`, want:{result:'PASS', passing:18, failing:[], messages:[]}},
  filtered:{filter:`^${TEST}$/^baseline$/^chatgpt$`, want:{result:'PASS', passing:1, failing:[], messages:[]}},
};

// STUB replaces contract/provider_wire_golden_test.go in a control copy: it runs one subtest per
// key and reports the messages WIRE_GOLDEN_STUB assigns to subtests and to the parent test.
const STUB = `package contract_test

import (
	"encoding/json"
	"os"
	"testing"
)

func ${TEST}(t *testing.T) {
	var stub struct {
		Keys    []string
		Failing map[string][]string
		Parent  []string
	}
	if err := json.Unmarshal([]byte(os.Getenv("WIRE_GOLDEN_STUB")), &stub); err != nil {
		t.Fatal(err)
	}
	for _, key := range stub.Keys {
		t.Run(key, func(t *testing.T) {
			for _, m := range stub.Failing[key] {
				t.Error(m)
			}
		})
	}
	for _, m := range stub.Parent {
		t.Error(m)
	}
}
`;

// stubbed runs the stub with the expected outcome of a case, changed by alter when given.
function stubbed(dir, name, alter) {
  const want = EXPECTED[name].want;
  let stub = {Keys:KEYS, Failing:{}, Parent:[]};
  if (want.failing.length) want.failing.forEach((key, i) => { stub.Failing[key] = [want.messages[i]]; });
  else stub.Parent = want.messages.slice();
  if (alter) stub = alter(JSON.parse(JSON.stringify(stub)));
  return runGolden(dir, EXPECTED[name].filter, {WIRE_GOLDEN_STUB:JSON.stringify(stub)});
}

function controlCopy() {
  const dir = copyModule();
  fs.writeFileSync(path.join(dir, 'contract/provider_wire_golden_test.go'), STUB);
  return dir;
}

if (require.main === module) {
  if (process.argv[2] === '--control' && process.argv[3] === 'good') {
    const dir = controlCopy();
    try {
      for (const name of Object.keys(EXPECTED)) verify(stubbed(dir, name), EXPECTED[name].want);
    } finally { fs.rmSync(dir, {recursive:true, force:true}); }
    console.log('wire golden observer accepted');
  } else if (process.argv[2] === '--control' && process.argv[3] === 'bad') {
    const dir = controlCopy();
    const blob = s => { s.Failing['baseline/anthropic'] = ['baseline/anthropic body mismatch\n got: {"a":1}\nwant: {"a":2}']; return s; };
    const rejects = [
      ['stale', 'the old test: stale keys leave it green', s => ({...s, Parent:[]})],
      ['stale', 'a stale key is not named', s => ({...s, Parent:s.Parent.slice(0, 1)})],
      ['stale', 'a route stopped running', s => ({...s, Keys:s.Keys.slice(1)})],
      ['nested', 'the old full-blob mismatch report', s => blob({...s, Failing:{}})],
      ['nested', 'the blob is still dumped after the path', s => { s.Failing['baseline/anthropic'].push('got: {}'); return s; }],
      ['nested', 'a different path notation', s => ({...s, Failing:{'baseline/anthropic':['baseline/anthropic body differs at /messages/0/content/0/text: got "hi", want "bye"']}})],
      ['first', 'every differing path is reported', s => { s.Failing['baseline/chatgpt'].push('baseline/chatgpt body differs at $.instructions: got "policy", want "rules"'); return s; }],
      ['first', 'a later path is reported first', s => ({...s, Failing:{'baseline/chatgpt':['baseline/chatgpt body differs at $.instructions: got "policy", want "rules"']}})],
      ['missing', 'a missing side is printed as null', s => ({...s, Failing:{...s.Failing, 'tools/anthropic/tools=false':['tools/anthropic/tools=false body differs at $.metadata: got null, want {"user_id":"x"}']}})],
      ['committed', 'a golden message on a passing run', s => ({...s, Parent:['stale golden key x is not visited by any route or variant']})],
      ['filtered', 'the filtered run reports the other keys as stale', s => ({...s, Parent:['stale golden key baseline/anthropic is not visited by any route or variant']})],
    ];
    try {
      for (const [name, label, alter] of rejects) {
        assert.throws(() => verify(stubbed(dir, name, alter), EXPECTED[name].want), undefined, name + ' must reject: ' + label);
      }
    } finally { fs.rmSync(dir, {recursive:true, force:true}); }
    console.log('wire golden observer rejected'); process.exitCode = 1;
  }
} else {
  const {Given, When, Then} = require('@cucumber/cucumber');
  const P = 'fix-l-contract-wire-goldens: ';
  Given(P + 'a scratch copy of the module', function () { this.wireCopy = copyModule(); });
  Given(P + 'the copy\'s golden gains the case {string} with the body of {string}', function (key, from) {
    editGolden(this.wireCopy, golden => {
      assert.ok(Object.hasOwn(golden, from), 'the golden fixture has no case ' + from);
      assert.ok(!Object.hasOwn(golden, key), 'the golden fixture already has the case ' + key);
      golden[key] = golden[from];
    });
  });
  Given(P + 'the copy\'s golden case {string} has {string} set to the JSON {string}', function (key, member, value) {
    editGolden(this.wireCopy, golden => { const {parent, last} = locate(golden, key, member); parent[last] = JSON.parse(value); });
  });
  Given(P + 'the copy\'s golden case {string} has no {string}', function (key, member) {
    editGolden(this.wireCopy, golden => {
      const {parent, last} = locate(golden, key, member);
      assert.ok(Object.hasOwn(parent, last), `case ${key} has no ${member}`);
      if (Array.isArray(parent)) parent.splice(Number(last), 1); else delete parent[last];
    });
  });
  When(P + 'the wire golden test runs in the copy with the filter {string}', {timeout:300000}, function (filter) {
    try { this.wireRun = runGolden(this.wireCopy, filter); } finally { fs.rmSync(this.wireCopy, {recursive:true, force:true}); }
  });
  When(P + 'the wire golden test runs in the working tree with the filter {string}', {timeout:300000}, function (filter) {
    this.wireRun = runGolden(process.cwd(), filter);
  });
  Then(P + 'the run outcome is:', function (text) { verify(this.wireRun, JSON.parse(text)); });
}
