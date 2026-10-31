'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');

const goArgs = ['test', './loop', './conformance', '-run', '^(TestVersionMatchesChangelog|TestDropBoundsDocumentation|TestQueuedLeverCleanup)$', '-count=1', '-v'];

Then('the changelog-from-commits CHANGELOG.md begins with exactly', function (expected) {
  const text = fs.readFileSync('CHANGELOG.md', 'utf8');
  const prefix = expected + '\n';
  assert.ok(text.startsWith(prefix),
    'CHANGELOG.md does not begin with the expected note and heading; actual beginning:\n' + text.slice(0, prefix.length + 200));
});

Then('the changelog-from-commits CHANGELOG.md history from {string} to the end has {int} bytes and sha256 {string}', function (heading, bytes, sha) {
  const text = fs.readFileSync('CHANGELOG.md', 'utf8');
  const i = text.indexOf(heading + '\n');
  assert.notEqual(i, -1, 'CHANGELOG.md has no line ' + JSON.stringify(heading));
  const history = Buffer.from(text.slice(i), 'utf8');
  assert.equal(history.length, bytes, 'CHANGELOG.md history section byte count changed (an entry was added, removed or edited)');
  assert.equal(crypto.createHash('sha256').update(history).digest('hex'), sha, 'CHANGELOG.md history section bytes changed');
});

When('I run the changelog-from-commits Go tests that read CHANGELOG.md', {timeout: 120000}, function () {
  this.changelogGo = spawnSync('go', goArgs, {encoding: 'utf8', timeout: 110000});
});

Then('the changelog-from-commits Go test {string} passed', function (name) {
  const r = this.changelogGo;
  const cmd = 'go ' + goArgs.join(' ');
  assert.ok(r, name + ': `' + cmd + '` was not run');
  const out = (r.stdout || '') + (r.stderr || '');
  const outcome = r.error ? 'error ' + r.error.message : 'exit ' + r.status;
  assert.ok(out.includes('--- PASS: ' + name + ' '),
    name + ' did not pass in `' + cmd + '` (' + outcome + ', ' +
    (out.includes('--- FAIL: ' + name + ' ') ? 'failed' : out.includes('--- SKIP: ' + name + ' ') ? 'skipped' : 'absent or ran zero times') + '):\n' + out);
  assert.equal(r.status, 0, name + ': `' + cmd + '` ended with ' + outcome + ':\n' + out);
});

Then('the changelog-from-commits README.md contains {string}', function (text) {
  assert.ok(fs.readFileSync('README.md', 'utf8').includes(text), 'README.md lacks: ' + text);
});

Then('the changelog-from-commits README.md does not contain {string}', function (text) {
  assert.ok(!fs.readFileSync('README.md', 'utf8').includes(text), 'README.md still contains: ' + text);
});
