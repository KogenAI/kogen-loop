'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');

When('loop-header-wait-on-messages-responses: I run the provider test {string}', {timeout: 110000}, function (name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'header-wait-'));
  fs.cpSync(process.cwd(), dir, {recursive: true, filter: src => !/(^|\/)(\.git|bin)$/.test(src)});
  fs.copyFileSync(path.join(process.cwd(), 'features/steps/loop-header-wait-on-messages-responses__driver/driver_test.go.txt'), path.join(dir, 'provider', 'zz_header_wait_driver_test.go'));
  this.hwName = name;
  this.hwCommand = `go test -json ./provider -run ^${name}$ -count=1 -timeout=90s`;
  this.hwResult = spawnSync('go', ['test', '-json', './provider', '-run', '^' + name + '$', '-count=1', '-timeout=90s'], {cwd: dir, encoding: 'utf8', timeout: 100000, maxBuffer: 32 * 1024 * 1024});
  fs.rmSync(dir, {recursive: true, force: true});
});

Then('loop-header-wait-on-messages-responses: the provider test ran and passed', function () {
  const r = this.hwResult;
  const detail = `Required test ${this.hwName} in ./provider; command ${this.hwCommand}; status ${r.status}; error ${r.error || 'none'}\n${r.stdout}\n${r.stderr}`;
  assert.ok(!r.error, detail);
  const events = r.stdout.split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l));
  const actions = events.filter(e => e.Test === this.hwName && ['pass', 'fail', 'skip'].includes(e.Action)).map(e => e.Action);
  assert.deepEqual(actions, ['pass'], `Test ${this.hwName} was absent, skipped, failed or ran zero times: ${detail}`);
  assert.equal(r.status, 0, detail);
});
