'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');
When('I run documentation range test {string}', {timeout: 180000}, function(name) {
  assert.ok(['TestLDOCRangeFind', 'TestLDOCRangePaging', 'TestLDOCRangeNotFound', 'TestLDOCRangeCompatibility', 'TestLDOCRangeConfigured'].includes(name));
  this.docRangeName = name;
  this.docRangeResult = spawnSync('go', ['test', '-json', '-count=1', '-timeout=120s', './tools', '-run', '^' + name + '$'], {encoding: 'utf8', timeout: 170000, maxBuffer: 8388608});
});
Then('the documentation range test passes with executed coverage', function() {
  const r = this.docRangeResult;
  assert.ifError(r.error);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const events = r.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(events.filter(e => e.Test === this.docRangeName && e.Action === 'run').length, 1, 'required test must run exactly once');
  assert.equal(events.filter(e => e.Test === this.docRangeName && e.Action === 'pass').length, 1, 'required test must pass exactly once');
  assert.ok(!events.some(e => e.Action === 'skip' || e.Action === 'fail'), 'no failed or skipped coverage');
});
