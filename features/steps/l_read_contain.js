'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');

When('I run root-read contract test {string}', {timeout: 180000}, function(name) {
  assert.match(name, /^TestReadContain[A-Za-z]+$/);
  this.rootReadRun = spawnSync('go', ['test', '-json', '-count=1', '-timeout=120s', './tools', '-run', '^' + name + '$'], {encoding: 'utf8', timeout: 150000, maxBuffer: 16 * 1024 * 1024});
});
Then('root-read contract test {string} passes', function(name) {
  const r = this.rootReadRun;
  const context = name + ': go test ./tools -run ^' + name + '$: ' + (r.error ? r.error.message : 'exit ' + r.status) + '\n' + r.stdout + r.stderr;
  assert.ok(!r.error, context);
  assert.equal(r.status, 0, context);
  const events = r.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line));
  assert.equal(events.filter(e => e.Test === name && e.Action === 'run').length, 1, context + '\nrequired test absent or ran zero/multiple times');
  assert.equal(events.filter(e => e.Test === name && e.Action === 'skip').length, 0, context + '\nrequired test skipped');
  assert.equal(events.filter(e => e.Test === name && e.Action === 'pass').length, 1, context + '\nrequired test did not pass');
});
