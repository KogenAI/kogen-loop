'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

let workspace;
function world() {
  if (!workspace) {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'round-limit-'));
    fs.chmodSync(workspace, 0o700);
    for (const n of ['home', 'tmp', 'cache', 'gopath']) fs.mkdirSync(path.join(workspace, n), {mode: 0o700});
    fs.writeFileSync(path.join(workspace, 'overlay.json'), JSON.stringify({Replace: {
      [path.resolve('loop/round_limit_acceptance_test.go')]: path.resolve('features/steps/round_limit_test.go.txt')
    }}), {mode: 0o600});
  }
  return workspace;
}
function execute(config) {
  const d = world();
  const r = spawnSync('go', ['test', '-json', '-count=1', '-timeout=60s', '-overlay', path.join(d, 'overlay.json'),
    './loop', '-run', '^TestRoundLimitAcceptance$'], {
    env: {LC_ALL: 'en_US.UTF-8', PATH: process.env.PATH, HOME: path.join(d, 'home'), TMPDIR: path.join(d, 'tmp'),
      GOCACHE: path.join(d, 'cache'), GOPATH: path.join(d, 'gopath'), GOENV: 'off', GOTOOLCHAIN: 'local', GOPROXY: 'off',
      GOSUMDB: 'off', RL_CASE: JSON.stringify(config)},
    encoding: 'utf8', timeout: 240000, maxBuffer: 16 * 1024 * 1024
  });
  assert.equal(r.error, undefined, 'process.error');
  assert.equal(r.status, 0, 'process.status\n' + r.stdout + r.stderr);
  const events = r.stdout.trim().split('\n').map(s => JSON.parse(s));
  assert.ok(events.some(e => e.Action === 'pass' && e.Test === 'TestRoundLimitAcceptance'), 'test did not pass');
  const lines = events.filter(e => e.Action === 'output' && e.Test === 'TestRoundLimitAcceptance')
    .map(e => String(e.Output)).join('').split('\n').filter(s => s.startsWith('RLOBS '));
  assert.equal(lines.length, 1, 'payload.count');
  return JSON.parse(lines[0].slice(6));
}

if (!process.env.RL_NO_CUCUMBER) {
  const {Given, When, Then, AfterAll} = require('@cucumber/cucumber');
  Given('the round-limit case is:', function(text) { this.rlCase = JSON.parse(text); });
  When('I run loop.Run with that case', {timeout: 300000}, function() { this.rlObs = execute(this.rlCase); });
  Then('the round-limit observation includes:', function(text) {
    const want = JSON.parse(text);
    for (const k of Object.keys(want)) assert.deepEqual(this.rlObs[k], want[k], k + ' in ' + JSON.stringify(this.rlObs));
  });
  Then('the documentation says {string} is not defaulted', function(name) {
    for (const f of ['README.md', 'docs/contract/loop-v1.md']) {
      const text = fs.readFileSync(f, 'utf8');
      assert.ok(text.includes(name), f + ' mentions ' + name);
      assert.ok(/no default/i.test(text), f + ' says there is no default');
    }
  });
  AfterAll(() => { if (workspace) fs.rmSync(workspace, {recursive: true, force: true}); });
}
