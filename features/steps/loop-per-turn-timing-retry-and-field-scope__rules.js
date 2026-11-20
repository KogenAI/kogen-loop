'use strict';
// Acceptance driver of loop-per-turn-timing-retry-and-field-scope. It runs a real Session round
// against a local fake openai-compatible provider (acceptance_test.go.txt, injected as a Go test
// file by overlay) and judges what each event carried.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const {Given, When, Then} = require('@cucumber/cucumber');

function runRound(scenario) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lptrf-'));
  try {
    const overlay = path.join(dir, 'overlay.json');
    fs.writeFileSync(overlay, JSON.stringify({Replace: {
      [path.resolve('loop/lptrf_acceptance_test.go')]: path.resolve('features/steps/loop-per-turn-timing-retry-and-field-scope__driver/acceptance_test.go.txt'),
    }}));
    const r = spawnSync('go', ['test', '-overlay', overlay, '-count=1', '-timeout=100s', '-v', '-run', '^TestLPTRFAcceptance$', './loop'],
      {env: {...process.env, LPTRF_SCENARIO: scenario}, encoding: 'utf8', timeout: 110000, maxBuffer: 8 * 1024 * 1024});
    const out = (r.stdout || '') + (r.stderr || '');
    assert.equal(r.status, 0, 'go test of TestLPTRFAcceptance in ./loop failed (status ' + r.status + '):\n' + out);
    assert.ok(out.includes('--- PASS: TestLPTRFAcceptance'), 'TestLPTRFAcceptance did not run and pass:\n' + out);
    const lines = out.split('\n').filter(l => l.startsWith('LPTRFOBS '));
    assert.equal(lines.length, 1, 'expected one LPTRFOBS line:\n' + out);
    return JSON.parse(lines[0].slice(9));
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

Given('loop-per-turn-timing-retry-and-field-scope: a round where the first attempt fails with HTTP 500 after 100 ms and the second answers after 200 ms', function () {
  this.scenario = 'retry';
});
Given('loop-per-turn-timing-retry-and-field-scope: a round whose history grows past the request ceiling so that it is condensed once', function () {
  this.scenario = 'condense';
});
When('loop-per-turn-timing-retry-and-field-scope: the round runs', function () {
  this.obs = runRound(this.scenario);
});
Then('loop-per-turn-timing-retry-and-field-scope: the round has exactly one response event whose model_ms is 300 as an integer', function () {
  const responses = this.obs.filter(e => e.type === 'response');
  assert.equal(responses.length, 1, 'response events: ' + responses.length);
  assert.deepEqual({has: responses[0].has, go_type: responses[0].go_type, value: responses[0].value, json: responses[0].json},
    {has: true, go_type: 'int64', value: '300', json: '300'}, 'model_ms of the one response event');
});
Then('loop-per-turn-timing-retry-and-field-scope: model_ms is an integer on every response event and on no other event', function () {
  assert.equal(this.obs.filter(e => e.type === 'context.condensed').length, 1, 'exactly one context.condensed event');
  const responses = this.obs.filter(e => e.type === 'response');
  assert.ok(responses.length >= 1, 'at least one response event');
  for (const e of this.obs) {
    if (e.type === 'response') {
      assert.ok(e.has && e.go_type === 'int64' && /^[0-9]+$/.test(e.json), 'response event model_ms: ' + JSON.stringify(e));
    } else {
      assert.equal(e.has, false, e.type + ' event carries model_ms: ' + JSON.stringify(e));
    }
  }
});
