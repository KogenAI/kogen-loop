'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');

let last;
function run(pkg, target, helper, name) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'turn-timing-'));
  const overlay = path.join(d, 'overlay.json');
  fs.writeFileSync(overlay, JSON.stringify({Replace: {
    [path.resolve(pkg + '/' + target)]: path.resolve('features/steps/loop-turn-timing-events__driver/' + helper)
  }}));
  const r = spawnSync('go', ['test', '-count=1', '-timeout=100s', '-overlay', overlay, './' + pkg, '-run', '^' + name + '$', '-v'], {encoding: 'utf8', timeout: 115000, maxBuffer: 16 * 1024 * 1024});
  last = {name, status: r.status, out: (r.stdout || '') + (r.stderr || '')};
}
const loopRun = name => run('loop', 'turn_timing_acceptance_test.go', 'timing_acceptance_test.go.txt', name);

When('loop-turn-timing-events: the split acceptance test runs', () => loopRun('TestTurnTimingSplitAcceptance'));
When('loop-turn-timing-events: the backoff acceptance test runs', () => loopRun('TestTurnTimingBackoffAcceptance'));
When('loop-turn-timing-events: the placement acceptance test runs', () => loopRun('TestTurnTimingPlacementAcceptance'));
When('loop-turn-timing-events: the session acceptance test runs', () =>
  run('conformance', 'turn_timing_session_acceptance_test.go', 'session_acceptance_test.go.txt', 'TestTurnTimingSessionAcceptance'));
Then('loop-turn-timing-events: the test passed', () => {
  assert.ok(last, 'no test ran');
  assert.equal(last.status, 0, last.name + ' failed:\n' + last.out);
  assert.ok(last.out.includes('--- PASS: ' + last.name), last.name + ' did not report PASS:\n' + last.out);
});
