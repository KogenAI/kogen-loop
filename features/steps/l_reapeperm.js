'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');

function run(args) {
  const result = spawnSync('go', args, {encoding: 'utf8', timeout: 270000, maxBuffer: 32 * 1024 * 1024});
  return {status: result.status, output: (result.stdout || '') + (result.stderr || ''), error: result.error && result.error.message};
}
When('I run the gone-group decision test 200 times', {timeout: 290000}, function () {
  this.goneGroupCommand = 'go test -count=200 -run TestLinuxTimeoutObservationDecisions ./sys';
  this.goneGroupRun = run(['test', '-count=200', '-run', 'TestLinuxTimeoutObservationDecisions', './sys']);
});
Then('the gone-group decision command succeeds', function () {
  assert.equal(this.goneGroupRun.status, 0, this.goneGroupCommand + ': ' + JSON.stringify(this.goneGroupRun));
});
When('I collect the deterministic gone-group case results 200 times', {timeout: 290000}, function () {
  this.goneGroupCaseCommand = 'go test -json -count=200 -run TestLinuxTimeoutObservationDecisions ./sys';
  this.goneGroupCases = run(['test', '-json', '-count=200', '-run', 'TestLinuxTimeoutObservationDecisions', './sys']);
});
Then('these gone-group tests each passed 200 times:', function (table) {
  const names = table.raw().map(row => row[0]);
  const counts = Object.fromEntries(names.map(name => [name, 0]));
  for (const line of this.goneGroupCases.output.split('\n')) {
    if (!line.startsWith('{')) continue;
    const event = JSON.parse(line);
    if (event.Action === 'pass' && Object.hasOwn(counts, event.Test)) counts[event.Test]++;
  }
  assert.deepEqual({status: this.goneGroupCases.status, counts},
    {status: 0, counts: Object.fromEntries(names.map(name => [name, 200]))},
    this.goneGroupCaseCommand + ': required tests ' + names.join(', ') + '; absent/skipped/zero-run tests have fewer than 200 passes; outcome ' + JSON.stringify(this.goneGroupCases));
});
