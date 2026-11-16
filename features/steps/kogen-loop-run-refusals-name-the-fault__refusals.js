'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {Given, When, Then, AfterAll} = require('@cucumber/cucumber');
const prefix = 'kogen-loop-run-refusals-name-the-fault: ';
let directory;
let binary;

Given(prefix + 'the CLI is built from this checkout', {timeout: 110000}, function () {
  if (!binary) {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kogen-loop-run-refusals-'));
    const target = path.join(directory, 'kogen-loop');
    const build = spawnSync('go', ['build', '-o', target, './cmd/kogen-loop'], {
      encoding: 'utf8', timeout: 100000,
    });
    assert.ifError(build.error);
    assert.equal(build.status, 0, 'go build ./cmd/kogen-loop: ' + build.stdout + build.stderr);
    binary = target;
  }
});

// The invocation is JSON: {"args": [...], "stdin": "...", "files": {"name": "content"}}.
When(prefix + 'I run the CLI with this invocation:', {timeout: 30000}, function (text) {
  const spec = JSON.parse(text);
  assert.ok(Array.isArray(spec.args) && spec.args.every(arg => typeof arg === 'string'));
  const work = fs.mkdtempSync(path.join(directory, 'work-'));
  for (const [name, content] of Object.entries(spec.files || {})) {
    fs.writeFileSync(path.join(work, name), content);
  }
  const result = spawnSync(binary, spec.args, {
    cwd: work, encoding: 'utf8', input: spec.stdin || '', timeout: 20000,
    env: {PATH: process.env.PATH, HOME: work},
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, 'CLI terminated by signal');
  this.runRefusal = {exit: result.status, stdout: result.stdout, stderr: result.stderr, args: spec.args};
});

Then(prefix + 'the run refusal has detail {string}', function (detail) {
  const r = this.runRefusal;
  const where = 'kogen-loop ' + JSON.stringify(r.args) + ' (stderr: ' + r.stderr + ')';
  assert.equal(r.exit, 2, 'exit code of ' + where);
  const lines = r.stdout.split('\n').filter(line => line !== '');
  const events = lines.map(line => JSON.parse(line));
  assert.ok(events.length >= 2, 'events of ' + where + ': ' + r.stdout);
  assert.equal(events.some(e => e.type === 'session.started'), false, 'session.started was emitted by ' + where);
  const errors = events.filter(e => e.type === 'error');
  assert.equal(errors.length, 1, 'error events of ' + where + ': ' + r.stdout);
  assert.equal(errors[0].class, 'loop', where);
  assert.equal(errors[0].reason, 'invalid_task', where);
  assert.equal(errors[0].detail, detail, 'detail of ' + where);
  const end = events[events.length - 1];
  assert.equal(end.type, 'session.ended', where);
  assert.equal(end.status, 'failed', where);
  assert.equal(end.exit, 2, where);
});

AfterAll(function () {
  if (directory) fs.rmSync(directory, {recursive: true, force: true});
});
