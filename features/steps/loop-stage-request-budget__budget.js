'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');

const dir0 = 'features/steps/loop-stage-request-budget__driver/';

When('loop-stage-request-budget: I run the stage budget driver test {string} in {string}', {timeout: 280000}, function (name, pkg) {
  assert.ok(pkg === 'provider' || pkg === 'loop', 'unknown package ' + pkg);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-budget-'));
  fs.cpSync(process.cwd(), dir, {recursive: true, filter: src => !/(^|\/)(\.git|bin)$/.test(src)});
  // The binding maps the driver onto the library interface. When the interface is not
  // implemented yet, a stub binding makes the driver compile and its tests run and fail.
  const implemented = fs.readdirSync(path.join(dir, 'provider')).filter(f => f.endsWith('.go') && !f.endsWith('_test.go'))
    .some(f => /type RequestBudget struct/.test(fs.readFileSync(path.join(dir, 'provider', f), 'utf8')));
  const binding = `${pkg}_binding_${implemented ? 'real' : 'stub'}.go.txt`;
  fs.copyFileSync(path.join(process.cwd(), dir0, `${pkg}_driver.go.txt`), path.join(dir, pkg, 'zz_stage_budget_driver_test.go'));
  fs.copyFileSync(path.join(process.cwd(), dir0, binding), path.join(dir, pkg, 'zz_stage_budget_binding_test.go'));
  this.sbCommand = `go test -json ./${pkg} -run ^${name}$ -count=1 -timeout=200s`;
  this.sbPkg = pkg;
  this.sbName = name;
  this.sbResult = spawnSync('go', ['test', '-json', './' + pkg, '-run', '^' + name + '$', '-count=1', '-timeout=200s'], {cwd: dir, encoding: 'utf8', timeout: 270000, maxBuffer: 32 * 1024 * 1024});
  fs.rmSync(dir, {recursive: true, force: true});
});

Then('loop-stage-request-budget: the driver test ran and passed', function () {
  const r = this.sbResult;
  const detail = `Required ${this.sbName} in ./${this.sbPkg}; command ${this.sbCommand}; status ${r.status}; error ${r.error || 'none'}\n${r.stdout}\n${r.stderr}`;
  assert.ok(!r.error, detail);
  assert.equal(r.status, 0, detail);
  const events = r.stdout.split('\n').filter(Boolean).map(l => JSON.parse(l));
  const actions = events.filter(e => e.Test === this.sbName && ['pass', 'fail', 'skip'].includes(e.Action)).map(e => e.Action);
  assert.deepEqual(actions, ['pass'], 'Absent, skipped, failed or zero-run test: ' + detail);
});
