'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');
let result;
const command = "go test -json ./provider -run '^TestBreakpointTTL' -count=1";
When('I run the breakpoint TTL tests', {timeout: 300000}, function () {
  if (!result) result = spawnSync('go', ['test', '-json', './provider', '-run', '^TestBreakpointTTL', '-count=1'], {encoding: 'utf8', timeout: 240000, maxBuffer: 16 * 1024 * 1024});
  this.ttlResult = result;
});
Then('breakpoint TTL test {string} must pass for {string}', function (name, behavior) {
  const r = this.ttlResult;
  const diagnostic = `${name}: ${behavior}\n${command}\noutcome status=${r.status}, error=${r.error || 'none'}\n${r.stdout || ''}${r.stderr || ''}`;
  const events = (r.stdout || '').split('\n').filter(Boolean).map(line => JSON.parse(line));
  const outcomes = events.filter(e => e.Package === 'kogen-loop/provider' && e.Test === name && ['pass', 'fail', 'skip'].includes(e.Action));
  assert.deepEqual(outcomes.map(e => e.Action), ['pass'], `${diagnostic}\nRequired test absent, skipped, failed or ran zero times`);
  assert.ok(!r.error && r.status === 0, diagnostic);
});
