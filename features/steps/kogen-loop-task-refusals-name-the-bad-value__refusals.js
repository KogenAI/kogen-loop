'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {Given, When, Then, AfterAll} = require('@cucumber/cucumber');
const prefix = 'kogen-loop-task-refusals-name-the-bad-value: ';
const driverPackage = './features/steps/kogen-loop-task-refusals-name-the-bad-value__driver';
let directory;
let cli;
let driver;

function build(target, pkg) {
  const result = spawnSync('go', ['build', '-o', target, pkg], {encoding: 'utf8', timeout: 100000});
  assert.ifError(result.error);
  assert.equal(result.status, 0, 'go build ' + pkg + ': ' + result.stdout + result.stderr);
  return target;
}

Given(prefix + 'the CLI and the library driver are built from this checkout', {timeout: 115000}, function () {
  if (!cli) {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kogen-loop-refusals-'));
    cli = build(path.join(directory, 'kogen-loop'), './cmd/kogen-loop');
    driver = build(path.join(directory, 'driver'), driverPackage);
  }
});

function scratch(name) {
  return fs.mkdtempSync(path.join(directory, name + '-'));
}

When(prefix + 'I run the CLI with a task whose fields are overridden by:', function (text) {
  const root = scratch('root');
  const home = scratch('home');
  const task = {
    protocol: 'kogen-loop/v1', root,
    role: {provider: 'chatgpt', model: 'fixture-model', effort: 'medium', base_url: ''},
    instructions: '', prompt: 'do the thing',
    tools: ['read_file', 'write_file', 'list_files', 'search_text', 'shell'],
    protected: [], excluded: [], terminal: ['finish'],
    deadline_seconds: 0, session: {dir: '', resume: false}, requires: [],
    ...JSON.parse(text),
  };
  const result = spawnSync(cli, ['run', '--task', '-'], {
    encoding: 'utf8', input: JSON.stringify(task), cwd: root, timeout: 30000,
    env: {HOME: home, TMPDIR: directory, PATH: process.env.PATH, KOGEN_PROVIDER_URL: 'http://127.0.0.1:1'},
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, 'CLI terminated by signal');
  const events = result.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line));
  const error = events.find(e => e.type === 'error');
  assert.ok(error, 'no error event; stdout ' + result.stdout + ' stderr ' + result.stderr);
  this.refusal = {class: error.class, reason: error.reason, detail: error.detail};
  this.cliResult = {exit: result.status, events};
});

When(prefix + 'I start a library session with the config:', function (text) {
  const root = scratch('root');
  const result = spawnSync(driver, [], {
    encoding: 'utf8', input: JSON.stringify({root, ...JSON.parse(text)}), timeout: 30000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, 'driver: ' + result.stdout + result.stderr);
  const out = JSON.parse(result.stdout);
  assert.equal(out.started, undefined, 'the session started although it must be refused');
  this.refusal = out;
});

Then(prefix + 'the CLI refuses the task as loop\\/invalid_task with exit code {int} and ends the session as failed before it starts', function (code) {
  const {exit, events} = this.cliResult;
  assert.equal(this.refusal.class, 'loop');
  assert.equal(this.refusal.reason, 'invalid_task');
  assert.equal(exit, code);
  assert.equal(events.some(e => e.type === 'session.started'), false, 'session.started was emitted');
  const last = events[events.length - 1];
  assert.equal(last.type, 'session.ended');
  assert.equal(last.status, 'failed');
  assert.equal(last.exit, code);
});

Then(prefix + 'the library refuses the session as loop\\/invalid_task', function () {
  assert.equal(this.refusal.class, 'loop');
  assert.equal(this.refusal.reason, 'invalid_task');
});

Then(prefix + 'the refusal has class {string}, reason {string} and detail {string}', function (cls, reason, detail) {
  assert.deepEqual(this.refusal, {class: cls, reason, detail});
});

AfterAll(function () {
  if (directory) fs.rmSync(directory, {recursive: true, force: true});
});
