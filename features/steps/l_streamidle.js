'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { When, Then } = require('@cucumber/cucumber');
When('I run stream idle test {string}', { timeout: 120000 }, function (name) {
  assert.match(name, /^TestStreamIdle(FirstByte|Gap|LongStream|AbsoluteBudget|Compatibility|Blocked)$/, 'Required test ' + name + ': invalid name for go test ./provider');
  this.streamIdle = spawnSync('go', ['test', '-json', './provider', '-run', '^' + name + '$', '-count=1', '-timeout=30s'], { encoding: 'utf8', timeout: 110000, maxBuffer: 16 * 1024 * 1024 });
});
Then('stream idle test {string} passes for {string}', function (name, rule) {
  const r = this.streamIdle;
  const context = 'Required ' + name + ': go test -json ./provider -run ^' + name + '$ -count=1 -timeout=30s; rule: ' + rule + '\n';
  assert.ok(r, context + 'command absent');
  assert.ok(!r.error, context + 'spawn failure: ' + String(r.error));
  assert.equal(r.status, 0, context + 'command failed\n' + r.stdout + r.stderr);
  const events = r.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line));
  const outcomes = events.filter(e => e.Package === 'kogen-loop/provider' && e.Test === name && ['pass', 'fail', 'skip'].includes(e.Action)).map(e => e.Action);
  assert.deepEqual(outcomes, ['pass'], context + 'test absent, skipped, failed or ran zero times; outcomes=' + JSON.stringify(outcomes) + '\n' + r.stdout + r.stderr);
});
