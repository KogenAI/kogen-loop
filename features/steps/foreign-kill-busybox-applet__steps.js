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
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'foreign-kill-busybox-applet-'));
    fs.writeFileSync(path.join(tmp, 'overlay.json'), JSON.stringify({Replace: {
      [path.join(dir.stdout.trim(), 'zz_foreign_kill_busybox_driver_test.go')]: path.resolve('features/steps/foreign-kill-busybox-applet__driver/driver_test.go.txt')
    }}));
  }
  return path.join(tmp, 'overlay.json');
}

Given('foreign-kill-busybox-applet: the shell command filter is available', function () {
  assert.ok(fs.existsSync('sys/foreign_kill.go'), 'sys/foreign_kill.go is missing');
});

When('foreign-kill-busybox-applet: the filter judges the command {string}', {timeout: 110000}, function (command) {
  const args = ['test', '-overlay', overlay(), './sys', '-run', '^TestForeignKillBusyboxDriver$', '-count=1', '-v', '-timeout=90s'];
  const r = spawnSync('go', args, {env: {...process.env, FKB_COMMAND: command}, encoding: 'utf8', timeout: 100000, maxBuffer: 16 * 1024 * 1024});
  const detail = `command: go ${args.join(' ')} (FKB_COMMAND=${JSON.stringify(command)}); status ${r.status}; error ${r.error || 'none'}\n${r.stdout}\n${r.stderr}`;
  assert.ok(!r.error, detail);
  assert.equal(r.status, 0, detail);
  assert.ok(/--- PASS: TestForeignKillBusyboxDriver /.test(r.stdout), 'TestForeignKillBusyboxDriver did not run and pass: ' + detail);
  const lines = r.stdout.split('\n').filter(l => l.startsWith('FKB '));
  assert.equal(lines.length, 1, 'expected one FKB line: ' + detail);
  this.fkb = JSON.parse(lines[0].slice(4));
  assert.equal(this.fkb.command, command, 'driver judged a different command');
});

Then('foreign-kill-busybox-applet: the command is refused with the rule {string}', function (rule) {
  assert.deepEqual({refused: this.fkb.refused, rule: this.fkb.rule}, {refused: true, rule}, JSON.stringify(this.fkb));
});

Then('foreign-kill-busybox-applet: the command is allowed', function () {
  assert.deepEqual({refused: this.fkb.refused, rule: this.fkb.rule}, {refused: false, rule: ''}, JSON.stringify(this.fkb));
});
