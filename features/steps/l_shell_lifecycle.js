'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');

function observe(result, name, command) {
  const detail = `${name}: ${command}; status=${result.status}; ${result.error || ''}\n${result.stdout || ''}${result.stderr || ''}`;
  assert.equal(result.status, 0, detail);
  const events = result.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line));
  const own = events.filter(e => e.Package === 'kogen-loop/conformance' && e.Test === name);
  assert.equal(own.filter(e => e.Action === 'run').length, 1, `${detail}\nrequired test absent or ran zero/multiple times: ${name}`);
  assert.equal(own.filter(e => e.Action === 'pass').length, 1, `${detail}\nrequired test did not pass: ${name}`);
  assert.ok(!events.some(e => e.Action === 'skip' || e.Action === 'fail'), `${detail}\nrequired test ${name} or its package/subtest skipped or failed`);
}

if (require.main === module && process.argv[2] === '--control') {
  const name = 'TestShellLifecycleControl';
  const good = process.argv[3] === 'good';
  const actions = good ? ['run', 'pass'] : ['pass'];
  const result = {status: 0, stdout: actions.map(Action => JSON.stringify({Package: 'kogen-loop/conformance', Test: name, Action})).join('\n') + '\n', stderr: ''};
  try {
    observe(result, name, 'synthetic observer control');
    console.log('observer accepted');
  } catch (_) {
    console.log('observer rejected');
    process.exitCode = 1;
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When('I run the shell lifecycle regression {string}', {timeout: 210000}, function(name) {
    assert.match(name, /^TestShellLifecycle[A-Za-z]+$/);
    const args = ['test', '-json', '-count=1', '-timeout=180s', './conformance', '-run', `^${name}$`];
    this.lifecycleCommand = 'go ' + args.join(' ');
    this.lifecycleResult = spawnSync('go', args, {encoding: 'utf8', timeout: 200000, maxBuffer: 32 * 1024 * 1024});
  });
  Then('the shell lifecycle regression {string} ran and passed', function(name) {
    observe(this.lifecycleResult, name, this.lifecycleCommand);
  });
  When('I run the shell lifecycle race suite', {timeout: 300000}, function() {
    this.lifecycleRace = spawnSync('go', ['test', '-race', '-count=1', '-timeout=240s', './...'], {encoding: 'utf8', timeout: 290000, maxBuffer: 32 * 1024 * 1024});
  });
  Then('the shell lifecycle race suite passes', function() {
    const r = this.lifecycleRace;
    assert.equal(r.status, 0, 'go test -race -count=1 -timeout=240s ./...\n' + r.stdout + r.stderr + (r.error || ''));
  });
}
