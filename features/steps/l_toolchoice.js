'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');
When('I run the named tool choice provider tests', {timeout: 300000}, function () {
  this.toolChoiceResult = spawnSync('go', ['test', '-json', './provider', '-run', '^TestToolChoice(Transport|EmptyBytes|Unsupported)$', '-count=1'], {encoding: 'utf8', timeout: 240000, maxBuffer: 16 * 1024 * 1024});
});
function passed(world, name) {
  const r = world.toolChoiceResult;
  assert.ifError(r.error);
  const events = r.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line));
  const results = events.filter(e => e.Package === 'kogen-loop/provider' && e.Test === name && ['pass', 'fail', 'skip'].includes(e.Action));
  assert.deepEqual(results.map(e => e.Action), ['pass'], 'Required test did not run and pass: ' + name + '\n' + r.stdout + r.stderr);
  assert.equal(r.status, 0, r.stdout + r.stderr);
}
Then('named tool choice test {string} must pass', function (name) { passed(this, name); });
Then('named tool choice test {string} must pass for Responses choice {string} and Chat choice {string}', function (name, responses, chat) {
  assert.deepEqual(JSON.parse(responses), {type: 'function', name: 'submit'});
  assert.deepEqual(JSON.parse(chat), {type: 'function', function: {name: 'submit'}});
  passed(this, name);
});
