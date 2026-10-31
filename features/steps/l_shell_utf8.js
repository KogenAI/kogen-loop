'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');
When('I run UTF8 regression {string} in {string}', {timeout: 180000}, function(name, pkg) {
  assert.ok(['TestLShellUTF8BinaryRequest', 'TestLShellUTF8DeliveryCases', 'TestLShellUTF8ValidAndCutRequest'].includes(name), `required test ${name}: unsupported name in ${pkg}`);
  assert.ok(['tools', 'conformance'].includes(pkg), `required test ${name}: unsupported package ${pkg}`);
  this.utf8Name = name;
  this.utf8Command = `go test -json -count=1 -timeout=120s ./${pkg} -run ^${name}$`;
  this.utf8Result = spawnSync('go', ['test', '-json', '-count=1', '-timeout=120s', './' + pkg, '-run', '^' + name + '$'], {encoding: 'utf8', timeout: 170000, maxBuffer: 8388608});
});
Then('the UTF8 regression must have run and passed', function() {
  const r = this.utf8Result;
  const context = `required test ${this.utf8Name}; command ${this.utf8Command}; exit ${r.status}; error ${r.error || 'none'}\n${r.stdout}\n${r.stderr}`;
  assert.ok(!r.error, context);
  assert.equal(r.status, 0, context);
  const events = r.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  assert.equal(events.filter(e => e.Test === this.utf8Name && e.Action === 'run').length, 1, context + '\nrequired test absent or ran other than once');
  assert.equal(events.filter(e => e.Test === this.utf8Name && e.Action === 'pass').length, 1, context + '\nrequired test did not pass exactly once');
  assert.ok(!events.some(e => e.Action === 'skip' || e.Action === 'fail'), context + '\nskipped or failed coverage');
});
