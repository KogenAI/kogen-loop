'use strict';
const { Then } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

function run(command) {
  const result = spawnSync('/bin/sh', ['-c', command], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 240000, maxBuffer: 32 * 1024 * 1024
  });
  if (result.error) throw result.error;
  return result;
}

Then('l-module-path: command {string} succeeds with stdout {string}', function (command, expected) {
  const result = run(command);
  assert.equal(result.status, 0, command + '\n' + result.stderr);
  assert.equal(result.stdout, expected + '\n', command);
});

Then('l-module-path: no Go file contains the quoted bare prefix', function () {
  const command = `grep -rn '"kogen-loop/' --include=*.go .`;
  const result = run(command);
  assert.equal(result.status, 1, command + '\n' + result.stdout + result.stderr);
});

Then('l-module-path: the existing build vet and test commands pass', { timeout: 250000 }, function () {
  const command = 'go build ./... && go vet ./... && go test ./...';
  const result = run(command);
  assert.equal(result.status, 0, command + '\n' + result.stdout + result.stderr);
});
