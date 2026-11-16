'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');

const P = 'managed-access-snapshot-without-refresh-secret';

When(P + ': I run the managed driver test {string}', {timeout: 280000}, function (name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'managed-access-'));
  fs.cpSync(process.cwd(), dir, {recursive: true, filter: src => !/(^|\/)(\.git|bin)$/.test(src)});
  fs.copyFileSync(path.join(process.cwd(), 'features/steps/' + P + '__driver/managed_driver.go.txt'), path.join(dir, 'provider', 'zz_managed_access_driver_test.go'));
  this.maName = name;
  this.maCommand = `go test -json ./provider -run ^${name}$ -count=1 -timeout=200s`;
  this.maResult = spawnSync('go', ['test', '-json', './provider', '-run', '^' + name + '$', '-count=1', '-timeout=200s'], {cwd: dir, encoding: 'utf8', timeout: 270000, maxBuffer: 32 * 1024 * 1024});
  fs.rmSync(dir, {recursive: true, force: true});
});

Then(P + ': the driver test ran and passed', function () {
  const r = this.maResult;
  const detail = `Required ${this.maName} in ./provider; command ${this.maCommand}; status ${r.status}; error ${r.error || 'none'}\n${r.stdout}\n${r.stderr}`;
  assert.ok(!r.error, detail);
  assert.equal(r.status, 0, detail);
  const events = r.stdout.split('\n').filter(Boolean).map(l => JSON.parse(l));
  const actions = events.filter(e => e.Test === this.maName && ['pass', 'fail', 'skip'].includes(e.Action)).map(e => e.Action);
  assert.deepEqual(actions, ['pass'], 'Absent, skipped, failed or zero-run test: ' + detail);
});

When(P + ': I read the caller contract', function () {
  this.maDoc = fs.readFileSync('docs/contract/loop-v1.md', 'utf8');
});

Then(P + ': it documents the managed file contract, freshness and identity checks, the single refresh owner, the failure and resume path and the local status limit', function () {
  const i = this.maDoc.indexOf('managed_access');
  assert.ok(i >= 0, 'docs/contract/loop-v1.md does not name managed_access');
  const section = this.maDoc.slice(Math.max(0, i - 400), i + 5000).toLowerCase();
  for (const want of ['access_token', 'expires_at', 'client_id', 'refresh_token', '60', 'refresh owner', 'atomic', 'owner refresh required', 'resume', 'not server', 'quota']) {
    assert.ok(section.includes(want), 'contract section on managed_access lacks "' + want + '"');
  }
});
