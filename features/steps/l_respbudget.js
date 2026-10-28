'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { When, Then } = require('@cucumber/cucumber');

When('I run response budget behavior test {string}', { timeout: 120000 }, function (name) {
  assert.match(name, /^TestClientResponseBudget[A-Za-z]+$/);
  this.responseBudgetResult = spawnSync('go', ['test', '-json', './provider', '-run', '^' + name + '$', '-count=1', '-timeout=30s'], {
    encoding: 'utf8', timeout: 110000, maxBuffer: 16 * 1024 * 1024
  });
});
Then('response budget behavior test {string} passes', function (name) {
  const r = this.responseBudgetResult;
  assert.ifError(r.error);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const events = r.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line));
  assert.deepEqual(events.filter(e => e.Package === 'kogen-loop/provider' && e.Test === name && ['pass', 'fail', 'skip'].includes(e.Action)).map(e => e.Action), ['pass'], 'Required behavior test did not run and pass: ' + name + '\n' + r.stdout);
});
