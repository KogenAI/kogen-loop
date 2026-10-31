'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');
let result;
const command = "go test -race -json ./loop -run '^TestToolOverlap' -count=1";
When('I run the tool overlap behavioral tests', {timeout: 300000}, function () {
  if (!result) result = spawnSync('go', ['test', '-race', '-json', './loop', '-run', '^TestToolOverlap', '-count=1'], {encoding: 'utf8', timeout: 240000, maxBuffer: 32 * 1024 * 1024});
  this.toolOverlapResult = result;
});
Then('tool overlap test {string} must run and pass', function (name) {
  const r = this.toolOverlapResult;
  const diagnostic = `Required ${name}; command ${command}; status ${r.status}; error ${r.error ? r.error.message : 'none'}\n${r.stdout || ''}${r.stderr || ''}`;
  assert.ok(!r.error, diagnostic);
  const events = (r.stdout || '').split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch (e) { assert.fail(`${diagnostic}\nInvalid go test JSON: ${line}`); }
  });
  const own = events.filter(e => e.Package === 'kogen-loop/loop' && e.Test === name);
  assert.equal(own.filter(e => e.Action === 'run').length, 1, `${diagnostic}\n${name} absent or ran zero/multiple times`);
  assert.deepEqual(own.filter(e => ['pass', 'fail', 'skip'].includes(e.Action)).map(e => e.Action), ['pass'], `${diagnostic}\n${name} absent, skipped or failed`);
  assert.equal(r.status, 0, diagnostic);
});
