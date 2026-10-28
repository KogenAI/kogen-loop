'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');
When('I run the authority breakpoint test {string}', {timeout: 300000}, function (name) {
  this.authorityTestName = name;
  this.authorityResult = spawnSync('go', ['test', '-json', './provider', '-run', '^' + name + '$', '-count=1'], {encoding: 'utf8', timeout: 240000, maxBuffer: 16 * 1024 * 1024});
});
Then('that authority breakpoint test must have passed', function () {
  const r = this.authorityResult;
  assert.ifError(r.error);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const events = r.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line));
  const outcomes = events.filter(e => e.Package === 'kogen-loop/provider' && e.Test === this.authorityTestName && ['pass', 'fail', 'skip'].includes(e.Action));
  assert.deepEqual(outcomes.map(e => e.Action), ['pass'], 'Required behavioral test did not run and pass: ' + this.authorityTestName + '\n' + r.stdout);
});
