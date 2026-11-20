'use strict';
// Acceptance driver of loop-per-turn-timing. It runs a real Session round against a local fake
// openai-compatible provider (acceptance_test.go.txt, injected as a Go test file by overlay)
// and judges the response and tool.result events.
// `node features/steps/loop-per-turn-timing__turns.js --control good|bad` checks the judgments
// on synthetic observations.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const {spawnSync} = require('node:child_process');

// parseTurns turns "300:200 | 100:150,50 | 100:finish" into provider ms and probe call ms per turn.
function parseTurns(text) {
  return text.split('|').map(p => {
    const [prov, calls] = p.trim().split(':');
    return {provider: Number(prov), calls: calls.trim() === 'finish' ? [] : calls.split(',').map(Number)};
  });
}
function runRound(cfg) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-per-turn-timing-'));
  try {
    const overlay = path.join(dir, 'overlay.json');
    fs.writeFileSync(overlay, JSON.stringify({Replace: {
      [path.resolve('loop/lptt_acceptance_test.go')]: path.resolve('features/steps/loop-per-turn-timing__driver/acceptance_test.go.txt'),
    }}));
    const r = spawnSync('go', ['test', '-overlay', overlay, '-count=1', '-timeout=100s', '-v', '-run', '^TestLoopPerTurnTimingAcceptance$', './loop'],
      {env: {...process.env, LPTT_CONFIG: JSON.stringify(cfg)}, encoding: 'utf8', timeout: 110000, maxBuffer: 8 * 1024 * 1024});
    const out = (r.stdout || '') + (r.stderr || '');
    assert.equal(r.status, 0, 'go test of TestLoopPerTurnTimingAcceptance in ./loop failed (status ' + r.status + '):\n' + out);
    assert.ok(out.includes('--- PASS: TestLoopPerTurnTimingAcceptance'), 'TestLoopPerTurnTimingAcceptance did not run and pass:\n' + out);
    const lines = out.split('\n').filter(l => l.startsWith('LPTTOBS '));
    assert.equal(lines.length, 1, 'expected one LPTTOBS line:\n' + out);
    const obs = JSON.parse(lines[0].slice(8));
    assert.deepEqual({ending: obs.ending, err: obs.err}, {ending: 'terminal', err: '<nil>'}, 'the round ends with the finish call');
    return obs;
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}
const list = text => text.split(',').map(s => s.trim());
function checkModelMs(obs, want) {
  assert.deepEqual(obs.responses.map(r => ({present: r.present, go_type: r.go_type, value: r.value, json: r.json})),
    list(want).map(v => ({present: true, go_type: 'int64', value: v, json: v})), 'response events: model_ms as int64 values and JSON integers, in order');
}
function checkElapsed(obs, want) {
  assert.deepEqual(obs.results.map(r => ({go_type: r.go_type, value: r.value})), list(want).map(v => ({go_type: 'int64', value: v})),
    'tool.result events: elapsed_ms, in order');
  assert.ok(obs.results.every(r => r.name === 'probe'), 'every tool.result belongs to a probe call, none to the finish call');
}
function checkSum(obs, wall) {
  assert.equal(obs.wall_ms, wall, 'wall time of the round on the injected clock');
  const sum = [...obs.responses.map(r => Number(r.value)), ...obs.results.map(r => Number(r.value))].reduce((a, b) => a + b, 0);
  assert.ok(sum <= wall, 'sum of model_ms and elapsed_ms is ' + sum + ', above the wall time ' + wall);
}
function checkReal(obs) {
  assert.equal(obs.responses.length, 1, 'one response event');
  const r = obs.responses[0];
  assert.ok(r.present && r.go_type === 'int64' && /^[0-9]+$/.test(r.value) && /^[0-9]+$/.test(r.json), 'model_ms is a non-negative int64: ' + JSON.stringify(r));
}

if (require.main === module) {
  const resp = vs => vs.map(v => ({present: true, go_type: 'int64', value: String(v), json: String(v)}));
  const res = vs => vs.map((v, i) => ({call_id: 'c' + i, name: 'probe', go_type: 'int64', value: String(v)}));
  const mode = process.argv[3];
  const base = {ending: 'terminal', err: '<nil>', wall_ms: 900, results: res([200, 150, 50])};
  const obs = mode === 'good' ? {...base, responses: resp([300, 100, 100])} : {...base, responses: resp([300, 300, 300])};
  try {
    checkModelMs(obs, '300,100,100');
    checkElapsed(obs, '200,150,50');
    checkSum(obs, 900);
    checkReal({responses: resp([0])});
    if (mode === 'bad') {
      checkReal({responses: [{present: false, go_type: '<nil>', value: '<nil>', json: '<nil>'}]});
    }
    console.log('loop-per-turn-timing observer good');
  } catch (e) {
    console.log('loop-per-turn-timing observer bad rejected');
    process.exit(1);
  }
} else {
  const {Given, When, Then} = require('@cucumber/cucumber');
  Given('loop-per-turn-timing: a round on the injected clock with the turns {string}', function (turns) {
    this.cfg = {clock: 'injected', turns: parseTurns(turns)};
  });
  Given('loop-per-turn-timing: a round with the tools clock left nil and the turns {string}', function (turns) {
    this.cfg = {clock: 'real', turns: parseTurns(turns)};
  });
  When('loop-per-turn-timing: the round runs', function () {
    this.obs = runRound(this.cfg);
  });
  Then('loop-per-turn-timing: the response events carry model_ms {string} as integers in that order', function (want) {
    checkModelMs(this.obs, want);
  });
  Then('loop-per-turn-timing: the tool.result events carry elapsed_ms {string} and the finish call has none', function (want) {
    checkElapsed(this.obs, want);
  });
  Then('loop-per-turn-timing: the sum of every model_ms and elapsed_ms is at most the wall time of {int} ms on the injected clock', function (wall) {
    checkSum(this.obs, wall);
  });
  Then('loop-per-turn-timing: the response event has model_ms as a non-negative integer of Go type int64', function () {
    checkReal(this.obs);
  });
}
