'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');
let result;
When('I run the prefix logging behavioral tests', {timeout: 300000}, function () {
  if (!result) result = spawnSync('go', ['test', '-json', './provider', '-run', '^TestPrefixLog', '-count=1'], {encoding: 'utf8', timeout: 240000, maxBuffer: 16 * 1024 * 1024});
  this.prefixLogResult = result;
});
Then('prefix logging test {string} must pass for {string}', function (name, rule) {
  const r = this.prefixLogResult;
  assert.ifError(r.error);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const events = r.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line));
  const outcomes = events.filter(e => e.Package === 'kogen-loop/provider' && e.Test === name && ['pass', 'fail', 'skip'].includes(e.Action));
  assert.deepEqual(outcomes.map(e => e.Action), ['pass'], rule + ': required behavioral test did not run and pass: ' + name + '\n' + r.stdout);
});
