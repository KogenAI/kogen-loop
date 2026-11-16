'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');

When('experimental-messages-route-bounds: I run the route driver test {string}', {timeout: 280000}, function (name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-messages-'));
  fs.cpSync(process.cwd(), dir, {recursive: true, filter: src => !/(^|\/)(\.git|bin)$/.test(src)});
  fs.copyFileSync(path.join(process.cwd(), 'features/steps/experimental-messages-route-bounds__driver/route_driver.go.txt'), path.join(dir, 'provider', 'zz_external_messages_driver_test.go'));
  this.emName = name;
  this.emCommand = `go test -json ./provider -run ^${name}$ -count=1 -timeout=200s`;
  this.emResult = spawnSync('go', ['test', '-json', './provider', '-run', '^' + name + '$', '-count=1', '-timeout=200s'], {cwd: dir, encoding: 'utf8', timeout: 270000, maxBuffer: 32 * 1024 * 1024});
  fs.rmSync(dir, {recursive: true, force: true});
});

Then('experimental-messages-route-bounds: the driver test ran and passed', function () {
  const r = this.emResult;
  const detail = `Required ${this.emName} in ./provider; command ${this.emCommand}; status ${r.status}; error ${r.error || 'none'}\n${r.stdout}\n${r.stderr}`;
  assert.ok(!r.error, detail);
  assert.equal(r.status, 0, detail);
  const events = r.stdout.split('\n').filter(Boolean).map(l => JSON.parse(l));
  const actions = events.filter(e => e.Test === this.emName && ['pass', 'fail', 'skip'].includes(e.Action)).map(e => e.Action);
  assert.deepEqual(actions, ['pass'], 'Absent, skipped, failed or zero-run test: ' + detail);
});

When('experimental-messages-route-bounds: I read the caller contract', function () {
  this.emDoc = fs.readFileSync('docs/contract/loop-v1.md', 'utf8');
});

Then('experimental-messages-route-bounds: it documents the explicit experimental route, its unsupported parts, the live qualification still needed, the Token Plan prohibition and the held QC studies', function () {
  const i = this.emDoc.indexOf('messages-compatible');
  assert.ok(i >= 0, 'docs/contract/loop-v1.md does not name messages-compatible');
  const section = this.emDoc.slice(i - 400, i + 4000).toLowerCase();
  for (const want of ['explicit', 'experimental', 'unsupported', 'live qualification', 'debit reconciliation', 'token plan', 'draft', 'unregistered', 'held', 'max_tokens']) {
    assert.ok(section.includes(want), 'contract section on messages-compatible lacks "' + want + '"');
  }
});
