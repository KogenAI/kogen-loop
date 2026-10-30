'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { When, Then } = require('@cucumber/cucumber');

// The named Go tests of L-IDLE-STREAM, by package.
const tests = {
  provider: /^TestIdleStream(SilentServer|KeepAlive|Progress)$/,
  conformance: /^TestIdleStreamRunLog$/,
};

When('I run idle stream test {string} in package {string}', { timeout: 300000 }, function (name, pkg) {
  const args = ['test', '-json', './' + pkg, '-run', '^' + name + '$', '-count=1', '-timeout=180s'];
  const shown = 'go ' + args.join(' ');
  assert.ok(Object.prototype.hasOwnProperty.call(tests, pkg), 'Required test ' + name + ': unknown package ' + pkg + ' (' + shown + ')');
  assert.match(name, tests[pkg], 'Required test ' + name + ': not an idle stream test of ./' + pkg + ' (' + shown + ')');
  const r = spawnSync('go', args, { encoding: 'utf8', timeout: 280000, maxBuffer: 64 * 1024 * 1024 });
  this.idleStream = { name, pkg, shown, r };
});

Then('idle stream test {string} in package {string} passes for {string}', function (name, pkg, rule) {
  const run = this.idleStream;
  assert.ok(run && run.name === name && run.pkg === pkg, 'Required test ' + name + ' in ./' + pkg + ': it was not run');
  const r = run.r;
  const context = 'Required test ' + name + ': ' + run.shown + '; rule: ' + rule + '\n';
  assert.ok(!r.error, context + 'spawn failure: ' + String(r.error));
  const events = [];
  for (const line of r.stdout.split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // build failures print plain text; it is kept in the message below
    }
  }
  const outcomes = events
    .filter(e => e.Package === 'kogen-loop/' + pkg && e.Test === name && ['pass', 'fail', 'skip'].includes(e.Action))
    .map(e => e.Action);
  const output = events.filter(e => e.Action === 'output').map(e => e.Output).join('') || r.stdout;
  assert.deepEqual(outcomes, ['pass'], context + 'exit ' + r.status + '; ' + name + ' was absent, skipped, failed or ran zero times; outcomes=' + JSON.stringify(outcomes) + '\n' + output + r.stderr);
  assert.equal(r.status, 0, context + name + ' passed but the command exited ' + r.status + '\n' + output + r.stderr);
});
