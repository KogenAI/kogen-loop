'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');
When('I run the L-CUT test {string} in {string}', {timeout: 180000}, function(name, pkg) {
  assert.match(name, /^TestLCut[A-Za-z0-9]+$/);
  assert.ok(['tools', 'loop'].includes(pkg));
  this.lcutName = name;
  this.lcutResult = spawnSync('mise', ['exec', 'go@1.27.2', '--', 'go', 'test', '-json', '-count=1', '-timeout=120s', './' + pkg, '-run', '^' + name + '$'], {encoding: 'utf8', timeout: 170000, maxBuffer: 8388608});
});
Then('the L-CUT named test passes', function() {
  const r = this.lcutResult;
  assert.ifError(r.error);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const events = r.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(events.filter(e => e.Test === this.lcutName && e.Action === 'run').length, 1, 'required test must run exactly once');
  assert.equal(events.filter(e => e.Test === this.lcutName && e.Action === 'pass').length, 1, 'required test must pass exactly once');
  assert.ok(!events.some(e => e.Action === 'skip' || e.Action === 'fail'), 'no failed or skipped coverage');
});
