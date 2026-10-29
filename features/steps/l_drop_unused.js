'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');

When('I run unused-option contract test {string}', {timeout: 180000}, function(name) {
  assert.match(name, /^Test[A-Za-z0-9]+$/);
  this.unusedOptionRun = spawnSync('go', ['test', '-json', '-count=1', '-timeout=120s', './conformance', '-run', '^' + name + '$'], {encoding: 'utf8', timeout: 150000, maxBuffer: 16 * 1024 * 1024});
});
Then('unused-option contract test {string} passes', function(name) {
  const r = this.unusedOptionRun;
  const context = 'go test ./conformance -run ^' + name + '$: ' + (r.error ? r.error.message : 'exit ' + r.status) + '\n' + r.stdout + r.stderr;
  assert.ok(!r.error, name + ': ' + context);
  assert.equal(r.status, 0, name + ': ' + context);
  const events = r.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line));
  assert.equal(events.filter(e => e.Test === name && e.Action === 'run').length, 1, name + ' absent or ran zero/multiple times: ' + context);
  assert.equal(events.filter(e => e.Test === name && e.Action === 'skip').length, 0, name + ' skipped: ' + context);
  assert.equal(events.filter(e => e.Test === name && e.Action === 'pass').length, 1, name + ' did not pass: ' + context);
});
