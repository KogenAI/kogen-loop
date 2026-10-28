'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');
When('I run documentation bound test {string}', {timeout: 180000}, function(name) {
  assert.ok(['TestLDocboundDefaults', 'TestLDocboundResultBound', 'TestLDocboundBodyBound', 'TestLDocboundValidation'].includes(name));
  this.docboundName = name;
  this.docboundResult = spawnSync('go', ['test', '-json', '-count=1', '-timeout=120s', './tools', '-run', '^' + name + '$'], {encoding: 'utf8', timeout: 170000, maxBuffer: 8388608});
});
Then('that documentation bound test passes without skipped coverage', function() {
  const r = this.docboundResult;
  assert.ifError(r.error);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const events = r.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(events.filter(e => e.Test === this.docboundName && e.Action === 'run').length, 1, 'required test must run exactly once');
  assert.equal(events.filter(e => e.Test === this.docboundName && e.Action === 'pass').length, 1, 'required test must pass exactly once');
  assert.ok(!events.some(e => e.Action === 'skip' || e.Action === 'fail'), 'no failed or skipped coverage');
});
