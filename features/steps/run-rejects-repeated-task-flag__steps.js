'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {Given, When, Then} = require('@cucumber/cucumber');

let binary;
let last;

function build() {
  if (binary) return binary;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-rejects-repeated-task-flag-'));
  const out = path.join(dir, 'kogen-loop');
  const r = spawnSync('go', ['build', '-o', out, './cmd/kogen-loop'], {encoding: 'utf8', timeout: 100000});
  assert.equal(r.status, 0, 'go build ./cmd/kogen-loop failed: ' + r.stdout + r.stderr);
  binary = out;
  return binary;
}

function run(args, input) {
  const argv = args.trim().split(/\s+/);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'run-rejects-repeated-task-flag-home-'));
  const r = spawnSync(build(), argv, {encoding: 'utf8', timeout: 30000, input, env: {...process.env, HOME: home}});
  assert.equal(r.error, undefined, 'could not run kogen-loop ' + args + ': ' + (r.error && r.error.message));
  const events = [];
  const lines = r.stdout.split('\n').filter((l) => l !== '');
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch (e) {
      assert.fail(`kogen-loop ${args}: stdout line is not JSON: ${JSON.stringify(line)}; stdout ${JSON.stringify(r.stdout)}`);
    }
  }
  last = {args, status: r.status, stdout: r.stdout, stderr: r.stderr, events};
}

function describe() {
  return `kogen-loop ${last.args}: exit ${last.status}, stdout ${JSON.stringify(last.stdout)}, stderr ${JSON.stringify(last.stderr)}`;
}

function errorEvent() {
  const ev = last.events[0];
  assert.ok(ev && ev.type === 'error', `first event is not an error event: ${describe()}`);
  return ev;
}

Given('run-rejects-repeated-task-flag: the kogen-loop binary is built', function () {
  build();
});

When('run-rejects-repeated-task-flag: I run kogen-loop with arguments {string}', function (args) {
  run(args, '');
});

When('run-rejects-repeated-task-flag: I run kogen-loop with arguments {string} and a kogen-loop\\/v2 task on standard input', function (args) {
  run(args, '{"protocol":"kogen-loop/v2"}');
});

Then('run-rejects-repeated-task-flag: it exits with code {int}', function (code) {
  assert.equal(last.status, code, `want exit ${code}: ${describe()}`);
});

Then('run-rejects-repeated-task-flag: stdout is an error event followed by a session.ended event with exit {int}', function (code) {
  assert.equal(last.events.length, 2, `want two events: ${describe()}`);
  assert.equal(last.events[0].type, 'error', describe());
  assert.equal(last.events[1].type, 'session.ended', describe());
  assert.equal(last.events[1].status, 'failed', describe());
  assert.equal(last.events[1].exit, code, describe());
});

Then('run-rejects-repeated-task-flag: the error event has reason {string}', function (reason) {
  const ev = errorEvent();
  assert.equal(ev.class, 'loop', describe());
  assert.equal(ev.reason, reason, describe());
});

Then('run-rejects-repeated-task-flag: the error detail names the --task option as given more than once', function () {
  const detail = String(errorEvent().detail);
  assert.ok(detail.includes('--task'), `error detail does not name --task: ${describe()}`);
  assert.match(detail, /more than once|repeated|twice|multiple/i, `error detail does not say the option was repeated: ${describe()}`);
});

Then('run-rejects-repeated-task-flag: the error detail contains {string}', function (text) {
  const detail = String(errorEvent().detail);
  assert.ok(detail.includes(text), `error detail does not contain ${JSON.stringify(text)}: ${describe()}`);
});

Then('run-rejects-repeated-task-flag: the error detail does not contain {string}', function (text) {
  const detail = String(errorEvent().detail);
  assert.ok(!detail.includes(text), `error detail unexpectedly contains ${JSON.stringify(text)}: ${describe()}`);
});
