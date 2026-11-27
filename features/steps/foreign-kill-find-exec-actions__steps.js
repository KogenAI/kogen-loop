'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {Given, When, Then} = require('@cucumber/cucumber');

let tmp;
function overlay() {
  if (!tmp) {
    const dir = spawnSync('go', ['list', '-f', '{{.Dir}}', './sys'], {encoding: 'utf8'});
    assert.equal(dir.status, 0, 'go list ./sys failed: ' + dir.stdout + dir.stderr);
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'foreign-kill-find-exec-actions-'));
    fs.writeFileSync(path.join(tmp, 'overlay.json'), JSON.stringify({Replace: {
      [path.join(dir.stdout.trim(), 'zz_foreign_kill_find_exec_driver_test.go')]: path.resolve('features/steps/foreign-kill-find-exec-actions__driver/driver_test.go.txt')
    }}));
  }
  return path.join(tmp, 'overlay.json');
}

Given('foreign-kill-find-exec-actions: the shell command filter is available', function () {
  assert.ok(fs.existsSync('sys/foreign_kill.go'), 'sys/foreign_kill.go is missing');
});

When('foreign-kill-find-exec-actions: the filter judges the command {string}', {timeout: 110000}, function (command) {
  const args = ['test', '-overlay', overlay(), './sys', '-run', '^TestForeignKillFindExecDriver$', '-count=1', '-v', '-timeout=90s'];
  const r = spawnSync('go', args, {env: {...process.env, FKF_COMMAND: command}, encoding: 'utf8', timeout: 100000, maxBuffer: 16 * 1024 * 1024});
  const detail = `command: go ${args.join(' ')} (FKF_COMMAND=${JSON.stringify(command)}); status ${r.status}; error ${r.error || 'none'}\n${r.stdout}\n${r.stderr}`;
  assert.ok(!r.error, detail);
  assert.equal(r.status, 0, detail);
  assert.ok(/--- PASS: TestForeignKillFindExecDriver /.test(r.stdout), 'TestForeignKillFindExecDriver did not run and pass: ' + detail);
  const lines = r.stdout.split('\n').filter(l => l.startsWith('FKF '));
  assert.equal(lines.length, 1, 'expected one FKF line: ' + detail);
  this.fkf = JSON.parse(lines[0].slice(4));
  assert.equal(this.fkf.command, command, 'driver judged a different command');
});

Then('foreign-kill-find-exec-actions: the command is refused with the rule {string}', function (rule) {
  assert.deepEqual({refused: this.fkf.refused, rule: this.fkf.rule}, {refused: true, rule}, JSON.stringify(this.fkf));
});

Then('foreign-kill-find-exec-actions: the command is allowed', function () {
  assert.deepEqual({refused: this.fkf.refused, rule: this.fkf.rule}, {refused: false, rule: ''}, JSON.stringify(this.fkf));
});
