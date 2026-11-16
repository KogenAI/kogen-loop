'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {Given, When, Then, AfterAll} = require('@cucumber/cucumber');
const prefix = 'kogen-loop-help-prints-usage: ';
let directory;
let binary;

Given(prefix + 'the CLI is built from this checkout', {timeout: 110000}, function () {
  if (!binary) {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kogen-loop-help-'));
    const target = path.join(directory, 'kogen-loop');
    const build = spawnSync('go', ['build', '-o', target, './cmd/kogen-loop'], {
      encoding: 'utf8', timeout: 100000,
    });
    assert.ifError(build.error);
    assert.equal(build.status, 0, 'go build ./cmd/kogen-loop: ' + build.stdout + build.stderr);
    binary = target;
  }
});

When(prefix + 'I invoke the CLI with arguments:', function (text) {
  const args = JSON.parse(text);
  assert.ok(Array.isArray(args) && args.every(arg => typeof arg === 'string'));
  const result = spawnSync(binary, args, {encoding: 'utf8', input: '', timeout: 10000});
  assert.ifError(result.error);
  assert.equal(result.signal, null, 'CLI terminated by signal');
  this.helpResult = {exit: result.status, stdout: result.stdout, stderr: result.stderr};
  this.helpArgs = args;
});

Then(prefix + 'the process result is exactly:', function (text) {
  assert.deepEqual(this.helpResult, JSON.parse(text), 'kogen-loop ' + JSON.stringify(this.helpArgs));
});

Then(prefix + 'the package comment names the help form {string}', function (form) {
  const source = fs.readFileSync('cmd/kogen-loop/main.go', 'utf8');
  const comment = source.slice(0, source.indexOf('package main'));
  assert.ok(comment.includes(form), 'cmd/kogen-loop/main.go package comment must name ' + form);
});

AfterAll(function () {
  if (directory) fs.rmSync(directory, {recursive: true, force: true});
});
