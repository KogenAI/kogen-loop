'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');
When('I run the L-TOOLDESC compact contract test', {timeout: 180000}, function() {
  this.lTooldescResult = spawnSync('go', ['test', '-json', '-count=1', '-timeout=120s', './tools', '-run', '^TestLTooldescCompact$'], {encoding: 'utf8', timeout: 170000, maxBuffer: 8388608});
});
Then('the L-TOOLDESC test {string} runs and passes', function(name) {
  const r = this.lTooldescResult;
  assert.ifError(r.error);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const events = r.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(events.filter(e => e.Test === name && e.Action === 'run').length, 1, 'required test must run exactly once');
  assert.equal(events.filter(e => e.Test === name && e.Action === 'pass').length, 1, 'required test must pass exactly once');
  assert.ok(!events.some(e => e.Action === 'skip' || e.Action === 'fail'), 'no skipped or failed tests');
});
