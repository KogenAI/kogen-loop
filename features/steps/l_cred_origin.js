'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');
When('I run compatible origin regression {string}', {timeout: 300000}, function (name) {
  this.credOriginName = name;
  this.credOriginResult = spawnSync('go', ['test', '-race', '-json', './provider', '-run', '^' + name + '$', '-count=1'], {encoding: 'utf8', timeout: 240000, maxBuffer: 16 * 1024 * 1024});
});
Then('compatible origin regression must run and pass', function () {
  const r = this.credOriginResult;
  const context = 'Required test ' + this.credOriginName + ' via go test -race -json ./provider -run ^' + this.credOriginName + '$ -count=1; status=' + r.status + '\n' + r.stdout + r.stderr;
  assert.ok(!r.error, context + '\n' + String(r.error || ''));
  assert.equal(r.status, 0, context);
  const events = r.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line));
  const outcomes = events.filter(e => e.Package === 'kogen-loop/provider' && e.Test === this.credOriginName && ['pass', 'fail', 'skip'].includes(e.Action));
  assert.deepEqual(outcomes.map(e => e.Action), ['pass'], context + '\nRequired test absent, skipped, failed or ran zero times');
});
