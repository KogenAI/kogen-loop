'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
function observe(r, name, command) {
  const detail = `${name}: ${command}; status=${r.status}; ${r.error || ''}\n${r.stdout || ''}${r.stderr || ''}`;
  assert.equal(r.status, 0, detail);
  const events = r.stdout.split('\n').filter(Boolean).map(x => JSON.parse(x));
  const own = events.filter(e => e.Package === 'kogen-loop/conformance' && e.Test === name);
  assert.equal(own.filter(e => e.Action === 'run').length, 1, `${detail}\n${name} absent or ran zero/multiple times`);
  assert.equal(own.filter(e => e.Action === 'pass').length, 1, `${detail}\n${name} did not pass`);
  assert.ok(!events.some(e => ['skip', 'fail'].includes(e.Action)), `${detail}\n${name}: skipped or failed test/package`);
}
if (require.main === module && process.argv[2] === '--control') {
  const name = 'TestLoopCorrectControl';
  const actions = process.argv[3] === 'good' ? ['run', 'pass'] : ['pass'];
  const stdout = actions.map(Action => JSON.stringify({Package: 'kogen-loop/conformance', Test: name, Action})).join('\n') + '\n';
  try { observe({status: 0, stdout}, name, 'control'); console.log('accepted'); }
  catch (_) { console.log('rejected'); process.exitCode = 1; }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When('I execute loop correctness test {string} for {string}', {timeout: 210000}, function(name, expected) {
    assert.match(name, /^TestLoopCorrect[A-Za-z]+$/, `${name}: invalid required test for ${expected}`);
    const args = ['test', '-json', '-count=1', '-timeout=180s', './conformance', '-run', `^${name}$`];
    this.lcCommand = 'go ' + args.join(' ');
    this.lcResult = spawnSync('go', args, {encoding: 'utf8', timeout: 200000, maxBuffer: 32 * 1024 * 1024});
  });
  Then('loop correctness test {string} ran and passed', function(name) { observe(this.lcResult, name, this.lcCommand); });
  When('I execute loop correctness race checks', {timeout: 300000}, function() {
    this.lcRace = spawnSync('go', ['test', '-race', './...'], {encoding: 'utf8', timeout: 290000, maxBuffer: 32 * 1024 * 1024});
  });
  Then('loop correctness race checks pass', function() {
    const r = this.lcRace;
    assert.equal(r.status, 0, `go test -race ./...; ${r.error || ''}\n${r.stdout || ''}${r.stderr || ''}`);
  });
}
