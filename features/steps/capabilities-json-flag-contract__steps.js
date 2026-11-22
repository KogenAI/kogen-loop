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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capabilities-json-flag-'));
  const out = path.join(dir, 'kogen-loop');
  const r = spawnSync('go', ['build', '-o', out, './cmd/kogen-loop'], {encoding: 'utf8', timeout: 100000});
  assert.equal(r.status, 0, 'go build ./cmd/kogen-loop failed: ' + r.stdout + r.stderr);
  binary = out;
  return binary;
}

Given('capabilities-json-flag-contract: the kogen-loop binary is built', function () {
  build();
});

When('capabilities-json-flag-contract: I run kogen-loop with arguments {string}', function (args) {
  const argv = args.trim() === '' ? [] : args.trim().split(/\s+/);
  const r = spawnSync(build(), argv, {encoding: 'utf8', timeout: 30000, input: ''});
  assert.equal(r.error, undefined, 'could not run kogen-loop ' + args + ': ' + (r.error && r.error.message));
  last = {args, status: r.status, stdout: r.stdout, stderr: r.stderr};
});

Then('capabilities-json-flag-contract: it exits with code {int}', function (code) {
  assert.equal(last.status, code, `kogen-loop ${last.args}: exit ${last.status}, want ${code}; stdout ${JSON.stringify(last.stdout)} stderr ${JSON.stringify(last.stderr)}`);
});

Then('capabilities-json-flag-contract: stdout is exactly one JSON object', function () {
  const text = last.stdout;
  assert.ok(text.endsWith('\n') && text.trim().split('\n').length === 1, `stdout is not one line: ${JSON.stringify(text)}`);
  const value = JSON.parse(text);
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), `stdout is not a JSON object: ${JSON.stringify(text)}`);
});

Then('capabilities-json-flag-contract: stdout is empty', function () {
  assert.equal(last.stdout, '', `kogen-loop ${last.args}: stdout ${JSON.stringify(last.stdout)}, want empty`);
});
