'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');

Then('the L7 unreleased changelog entries are exactly', function (expected) {
  const text = fs.readFileSync('CHANGELOG.md', 'utf8');
  const section = text.split(/^## v0\.1\.0 \(unreleased\)\s*$/m)[1];
  assert.notEqual(section, undefined, 'missing unreleased section');
  const entries = section.split(/^## /m)[0].split('\n').filter(s => /^- /.test(s)).map(s => s.slice(2));
  assert.deepEqual(entries, expected.split('\n'));
});
Then('README contains the L7 current status text', function (text) {
  assert.ok(fs.readFileSync('README.md', 'utf8').includes(text), 'missing dated current status');
});
Then('README does not contain the L7 stale current claim {string}', function (text) {
  assert.ok(!fs.readFileSync('README.md', 'utf8').includes(text), 'stale adoption claim');
});
Then('README contains the L7 historical marker {string}', function (text) {
  assert.ok(fs.readFileSync('README.md', 'utf8').includes(text), 'lost historical baseline');
});
Then('README contains the L7 release boundary {string}', function (text) {
  assert.ok(fs.readFileSync('README.md', 'utf8').includes(text), 'missing release boundary');
});
When('I inspect the L7 public version', {timeout: 120000}, function () {
  this.l7doc = spawnSync('go', ['doc', 'kogen-loop/loop.Version'], {encoding: 'utf8', timeout: 110000});
});
Then('the L7 public documentation contains {string}', function (text) {
  assert.equal(this.l7doc.status, 0, this.l7doc.stderr);
  assert.ok(this.l7doc.stdout.includes(text), this.l7doc.stdout);
});
When('I run the L7 version consistency test', {timeout: 120000}, function () {
  this.l7test = spawnSync('go', ['test', './loop', '-run', '^TestVersionMatchesChangelog$', '-count=1', '-v'], {encoding: 'utf8', timeout: 110000});
});
Then('the L7 version consistency test passes with name {string}', function (name) {
  assert.equal(this.l7test.status, 0, this.l7test.stdout + this.l7test.stderr);
  assert.ok(this.l7test.stdout.includes('--- PASS: ' + name), this.l7test.stdout);
});
