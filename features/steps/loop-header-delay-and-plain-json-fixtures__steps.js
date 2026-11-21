'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');

When('loop-header-delay-and-plain-json-fixtures: I run the provider test {string}', {timeout: 110000}, function (name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'header-delay-'));
  fs.cpSync(process.cwd(), dir, {recursive: true, filter: src => !/(^|\/)(\.git|bin)$/.test(src)});
  fs.copyFileSync(path.join(process.cwd(), 'features/steps/loop-header-delay-and-plain-json-fixtures__driver/driver_test.go.txt'), path.join(dir, 'provider', 'zz_header_delay_driver_test.go'));
  this.hdName = name;
  this.hdCommand = `go test -json ./provider -run ^${name}$ -count=1 -timeout=90s`;
  this.hdResult = spawnSync('go', ['test', '-json', './provider', '-run', '^' + name + '$', '-count=1', '-timeout=90s'], {cwd: dir, encoding: 'utf8', timeout: 100000, maxBuffer: 32 * 1024 * 1024});
  fs.rmSync(dir, {recursive: true, force: true});
});

Then('loop-header-delay-and-plain-json-fixtures: the provider test ran and passed', function () {
  const r = this.hdResult;
  const detail = `Required test ${this.hdName} in ./provider; command ${this.hdCommand}; status ${r.status}; error ${r.error || 'none'}\n${r.stdout}\n${r.stderr}`;
  assert.ok(!r.error, detail);
  const events = r.stdout.split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l));
  const actions = events.filter(e => e.Test === this.hdName && ['pass', 'fail', 'skip'].includes(e.Action)).map(e => e.Action);
  assert.deepEqual(actions, ['pass'], `Test ${this.hdName} was absent, skipped, failed or ran zero times: ${detail}`);
  assert.equal(r.status, 0, detail);
});
