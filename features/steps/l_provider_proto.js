'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');

When('the provider proto regression {string} runs in {string}', {timeout: 300000}, function (name, pkg) {
  const args = ['test', '-json', '-count=1', '-timeout=240s', '-run', '^' + name + '$', pkg];
  const r = spawnSync('go', args, {encoding: 'utf8', timeout: 280000, maxBuffer: 16 * 1024 * 1024});
  this.proto = {name, command: 'go ' + args.join(' '), r};
});
Then('that provider proto regression ran and passed', function () {
  const {name, command, r} = this.proto;
  const out = (r.stdout || '') + (r.stderr || '');
  const diagnostic = `${name}: ${command}; status=${r.status}; error=${r.error || ''}\n${out}`;
  assert.equal(r.status, 0, diagnostic);
  const events = (r.stdout || '').split('\n').filter(Boolean).map(line => JSON.parse(line));
  const actions = events.filter(e => e.Test === name).map(e => e.Action);
  assert.equal(actions.filter(a => a === 'run').length, 1, `${name}: absent or ran zero/multiple times; ${diagnostic}`);
  assert.equal(actions.filter(a => a === 'pass').length, 1, `${name}: absent, skipped or failed; ${diagnostic}`);
  assert.ok(!actions.includes('skip'), `${name}: skipped; ${diagnostic}`);
});
When('the provider proto compatibility checks run', {timeout: 1200000}, function () {
  const commands = ['test -z "$(gofmt -l .)"', 'go test ./...', 'go test -race ./...', 'go vet ./...', 'go build -o /dev/null ./...'];
  this.protoChecks = commands.map(command => ({command, r: spawnSync('/bin/sh', ['-c', command], {encoding: 'utf8', timeout: 220000, maxBuffer: 16 * 1024 * 1024})}));
});
Then('all provider proto compatibility checks pass', function () {
  for (const {command, r} of this.protoChecks) {
    assert.equal(r.status, 0, `${command}: ${r.error || ''}\n${r.stdout || ''}${r.stderr || ''}`);
  }
});
