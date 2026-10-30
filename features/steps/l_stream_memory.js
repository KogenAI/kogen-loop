'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');
When('I run the streaming memory regression', {timeout: 180000}, function () {
  this.streamMemory = spawnSync('go', ['test', '-json', '-count=1', '-timeout=120s', './provider', '-run', '^TestLStreamMemory$'], {encoding: 'utf8', timeout: 170000, maxBuffer: 8388608});
});
Then('the required streaming memory regression {string} passes without missing or skipped coverage', function (name) {
  const r = this.streamMemory;
  const context = `${name}: go test -json -count=1 -timeout=120s ./provider -run ^TestLStreamMemory$; status=${r.status}; error=${r.error || ''}\n${r.stdout || ''}${r.stderr || ''}`;
  assert.ok(!r.error && r.status === 0, context);
  let events;
  try { events = r.stdout.trim().split('\n').filter(Boolean).map(x => JSON.parse(x)); }
  catch (e) { assert.fail(`${context}\ninvalid JSON: ${e.message}`); }
  assert.equal(events.filter(e => e.Test === name && e.Action === 'run').length, 1, `${context}\nrequired test absent or ran zero/multiple times`);
  assert.equal(events.filter(e => e.Test === name && e.Action === 'pass').length, 1, `${context}\nrequired test did not pass exactly once`);
  assert.ok(!events.some(e => e.Action === 'skip' || e.Action === 'fail'), `${context}\nrequired coverage skipped or failed`);
});
