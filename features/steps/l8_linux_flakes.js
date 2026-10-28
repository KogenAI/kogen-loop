'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {spawnSync} = require('node:child_process');
const {Given, When, Then} = require('@cucumber/cucumber');

function body(file, name) {
  const src = fs.readFileSync(file, 'utf8');
  const start = src.indexOf('func ' + name + '(');
  assert.ok(start >= 0, 'missing test ' + name);
  const end = src.indexOf('\n}\n', start);
  assert.ok(end > start, 'unterminated test ' + name);
  return src.slice(start, end);
}

Given('the open-socket provider test and the custody observation test', function () {
  this.wait = body('provider/wait_test.go', 'TestEmptyTerminalMetadataKeepsOrderedItemsOnAnOpenSocket');
  this.custody = fs.readFileSync('sys/timeout_custody_liveness_test.go', 'utf8');
  body('sys/timeout_custody_liveness_test.go', 'TestTimeoutCustodyBlockedObservation');
});

When('I run {string} fifty times with GOMAXPROCS 2 in package {string}', {timeout: 290000}, function (name, pkg) {
  const r = spawnSync('go', ['test', '-race', '-count=50', '-timeout=270s', '-run', '^' + name + '$', pkg],
    {encoding: 'utf8', timeout: 280000, maxBuffer: 16 * 1024 * 1024, env: {...process.env, GOMAXPROCS: '2'}});
  this.run = {status: r.status, out: (r.stdout || '') + (r.stderr || '')};
});

Then('the go test run passes', function () {
  assert.equal(this.run.status, 0, this.run.out);
  assert.match(this.run.out, /^ok\s/m);
});

Then('the open-socket test waits for the open and closed events without a two second timer', function () {
  assert.ok(!/time\.After\(\s*2\s*\*\s*time\.Second\s*\)/.test(this.wait), 'fixed 2s wait remains');
  assert.match(this.wait, /<-opened/);
  assert.match(this.wait, /<-closed/);
  assert.ok(!/select\s*\{\s*case <-opened:\s*default:/.test(this.wait), 'non-blocking opened check remains');
});

Then('the custody fixture binary is built once per test binary with no build deadline', function () {
  assert.match(this.custody, /sync\.Once/);
  assert.equal((this.custody.match(/"-c"/g) || []).length, 1, 'exactly one build site');
  assert.ok(!/CommandContext\(ctx, "go"/.test(this.custody), 'build still under a wall-clock deadline');
  const per = this.custody.slice(this.custody.indexOf('func TestTimeoutCustodyBlockedObservation'));
  assert.ok(!/t\.Run\([^)]*custodyObserverBinary/.test(per));
});

Then('both tests still assert their original outcomes', function () {
  assert.match(this.wait, /resp\.Usage != \(Usage\{100, 5, 20, 10\}\)/);
  assert.match(this.wait, /len\(f\.requests\(\)\) != 1/);
  for (const s of ['TERM grace was skipped', 'unresolved observation returned', 'stop blocked by observation', 'blocked observation postponed SIGKILL', 'published stopping result']) {
    assert.ok(this.custody.includes(s), 'lost assertion: ' + s);
  }
});
