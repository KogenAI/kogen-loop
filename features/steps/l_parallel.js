'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');
let result;
When('I execute the parallel tool calls contract tests', {timeout: 300000}, function () {
  if (!result) result = spawnSync('go', ['test', '-json', './provider', './loop', '-run', '^TestParallelToolCalls', '-count=1'], {encoding: 'utf8', timeout: 240000, maxBuffer: 16 * 1024 * 1024});
  this.parallelResult = result;
});
Then('the parallel tool calls test {string} {string} must have passed', function (pkg, name) {
  const r = this.parallelResult;
  assert.ifError(r.error);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const events = r.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line));
  const outcomes = events.filter(e => e.Package === pkg && e.Test === name && ['pass', 'fail', 'skip'].includes(e.Action));
  assert.deepEqual(outcomes.map(e => e.Action), ['pass'], 'Required behavioral test did not run and pass: ' + pkg + '/' + name + '\n' + r.stdout);
});
