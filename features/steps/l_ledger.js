'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');

When('I execute the read-ledger case {string}', {timeout: 180000}, function(name) {
  assert.match(name, /^[a-z_]+$/);
  this.ledgerRun = spawnSync('go', ['test', '-json', '-count=1', '-timeout=90s', './loop', '-run', '^TestReadLedger$/^' + name + '$'], {encoding: 'utf8', timeout: 150000, maxBuffer: 16 * 1024 * 1024});
});
Then('the read-ledger case {string} passes without being skipped', function(name) {
  const r = this.ledgerRun;
  assert.ifError(r.error);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const events = r.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line));
  const target = 'TestReadLedger/' + name;
  assert.ok(events.some(e => e.Test === target && e.Action === 'run'), 'missing executable case ' + target);
  assert.ok(events.some(e => e.Test === target && e.Action === 'pass'), 'case did not pass ' + target);
  assert.ok(!events.some(e => e.Test === target && e.Action === 'skip'), 'case was skipped ' + target);
});
