'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');
When('I prepare an L-WINDOW request with budget {int} and rendered size {int}', {timeout: 120000}, function(budget, bytes) {
  const result = spawnSync('go', ['run', 'features/steps/l_window_driver.go', String(budget), String(bytes)], {
    encoding: 'utf8', timeout: 110000, maxBuffer: 1024 * 1024,
    env: {...process.env, GOPROXY: 'off', GOSUMDB: 'off'}
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  this.lWindowOutcome = result.stdout.trim();
});
Then('the L-WINDOW outcome is {string}', function(expected) {
  assert.equal(this.lWindowOutcome, expected);
});
