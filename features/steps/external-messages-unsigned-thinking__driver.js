'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');

When('external-messages-unsigned-thinking: I run the driver test {string}', {timeout: 280000}, function (name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-unsigned-'));
  fs.cpSync(process.cwd(), dir, {recursive: true, filter: src => !/(^|\/)(\.git|bin)$/.test(src)});
  fs.copyFileSync(path.join(process.cwd(), 'features/steps/external-messages-unsigned-thinking__driver/driver_test.go.txt'), path.join(dir, 'provider', 'zz_unsigned_thinking_driver_test.go'));
  this.utName = name;
  this.utCommand = `go test -json ./provider -run ^${name}$ -count=1 -timeout=200s`;
  this.utResult = spawnSync('go', ['test', '-json', './provider', '-run', '^' + name + '$', '-count=1', '-timeout=200s'], {cwd: dir, encoding: 'utf8', timeout: 270000, maxBuffer: 32 * 1024 * 1024});
  fs.rmSync(dir, {recursive: true, force: true});
});

Then('external-messages-unsigned-thinking: the driver test {string} ran and passed', function (name) {
  assert.equal(name, this.utName, 'the Then step must name the test the When step ran');
  const r = this.utResult;
  const detail = `Required ${name} in ./provider; command ${this.utCommand}; status ${r.status}; error ${r.error || 'none'}\n${r.stdout}\n${r.stderr}`;
  assert.ok(!r.error, detail);
  assert.equal(r.status, 0, detail);
  const events = r.stdout.split('\n').filter(Boolean).map(l => JSON.parse(l));
  const actions = events.filter(e => e.Test === name && ['pass', 'fail', 'skip'].includes(e.Action)).map(e => e.Action);
  assert.deepEqual(actions, ['pass'], 'Absent, skipped, failed or zero-run test: ' + detail);
});
