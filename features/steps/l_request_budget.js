'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');
When('I run request budget test {string} in {string}', {timeout: 240000}, function (name, pkg) {
  this.budgetCommand = `go test -json ${pkg} -run ^${name}$ -count=1 -timeout=180s`;
  this.budgetResult = spawnSync('go', ['test', '-json', pkg, '-run', '^' + name + '$', '-count=1', '-timeout=180s'], {encoding: 'utf8', timeout: 230000, maxBuffer: 32 * 1024 * 1024});
});
Then('request budget test {string} in {string} ran and passed', function (name, pkg) {
  const r = this.budgetResult;
  const detail = `Required ${name} in ${pkg}; command ${this.budgetCommand}; status ${r.status}; error ${r.error || 'none'}\n${r.stdout}\n${r.stderr}`;
  assert.ok(!r.error, detail);
  assert.equal(r.status, 0, detail);
  const events = r.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line));
  assert.deepEqual(events.filter(e => e.Package === 'kogen-loop/' + pkg.slice(2) && e.Test === name && ['pass', 'fail', 'skip'].includes(e.Action)).map(e => e.Action), ['pass'], 'Absent, skipped, failed or zero-run test: ' + detail);
});
