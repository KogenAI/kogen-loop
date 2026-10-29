'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');

When('I inspect the shell-limit Tools API', function() {
  this.shellLimitAPI = spawnSync('go', ['doc', 'kogen-loop/tools.Tools'], {encoding: 'utf8', timeout: 30000});
});
Then('the shell-limit API does not contain {string}', function(field) {
  const r = this.shellLimitAPI;
  assert.equal(r.status, 0, 'go doc kogen-loop/tools.Tools: ' + r.stdout + r.stderr + (r.error || ''));
  assert.ok(!r.stdout.includes(field), 'go doc kogen-loop/tools.Tools still exposes ' + field + '\n' + r.stdout);
});
When('I run the shell-limit behavior packages', {timeout: 240000}, function() {
  this.shellLimitTests = spawnSync('go', ['test', '-count=1', '-timeout=180s', './tools', './loop', './conformance'], {encoding: 'utf8', timeout: 220000, maxBuffer: 16 * 1024 * 1024});
});
Then('the shell-limit behavior packages pass', function() {
  const r = this.shellLimitTests;
  assert.equal(r.status, 0, 'go test -count=1 -timeout=180s ./tools ./loop ./conformance\n' + r.stdout + r.stderr + (r.error || ''));
});
