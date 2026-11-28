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
    const dir = spawnSync('go', ['list', '-f', '{{.Dir}}', './tools'], {encoding: 'utf8'});
    assert.equal(dir.status, 0, 'go list ./tools failed: ' + dir.stdout + dir.stderr);
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-invalid-command-with-handle-'));
    fs.writeFileSync(path.join(tmp, 'overlay.json'), JSON.stringify({Replace: {
      [path.join(dir.stdout.trim(), 'zz_shell_invalid_command_with_handle_driver_test.go')]: path.resolve('features/steps/shell-invalid-command-with-handle__driver/driver_test.go.txt')
    }}));
  }
  return path.join(tmp, 'overlay.json');
}

Given('shell-invalid-command-with-handle: the shell tool is available with a running command whose handle is {string}', function (placeholder) {
  assert.equal(placeholder, '$HANDLE');
  assert.ok(fs.existsSync('tools/tools.go'), 'tools/tools.go is missing');
});

When('shell-invalid-command-with-handle: the shell tool is called with the arguments {string}', {timeout: 110000}, function (json) {
  JSON.parse(json);
  const args = ['test', '-overlay', overlay(), './tools', '-run', '^TestShellInvalidCommandWithHandleDriver$', '-count=1', '-v', '-timeout=90s'];
  const r = spawnSync('go', args, {env: {...process.env, SICH_ARGS: json}, encoding: 'utf8', timeout: 100000, maxBuffer: 16 * 1024 * 1024});
  const detail = `command: go ${args.join(' ')} (SICH_ARGS=${json}); status ${r.status}; error ${r.error || 'none'}\n${r.stdout}\n${r.stderr}`;
  assert.ok(!r.error, detail);
  assert.equal(r.status, 0, detail);
  assert.ok(/--- PASS: TestShellInvalidCommandWithHandleDriver /.test(r.stdout), 'TestShellInvalidCommandWithHandleDriver did not run and pass: ' + detail);
  const lines = r.stdout.split('\n').filter(l => l.startsWith('SICH '));
  assert.equal(lines.length, 1, 'expected one SICH line: ' + detail);
  this.result = JSON.parse(lines[0].slice(5));
});

Then('shell-invalid-command-with-handle: the call is refused as a wrong argument type', function () {
  assert.equal(this.result.class, 'wrong_argument_type', JSON.stringify(this.result));
  assert.ok(this.result.text.startsWith('error:'), JSON.stringify(this.result));
});

Then('shell-invalid-command-with-handle: the refusal message names command', function () {
  assert.ok(/\bcommand\b/.test(this.result.text), JSON.stringify(this.result));
  assert.ok(!/\bhandle\b/.test(this.result.text), 'the message should name only the bad argument: ' + JSON.stringify(this.result));
});

Then('shell-invalid-command-with-handle: the command runs to completion with status 0 and output {string}', function (output) {
  assert.deepEqual({text: this.result.text, class: this.result.class, kind: this.result.kind}, {text: 'exit status: 0\n' + output, class: '', kind: ''}, JSON.stringify(this.result));
});

Then('shell-invalid-command-with-handle: the running command is retrieved by its handle', function () {
  assert.equal(this.result.class, '', JSON.stringify(this.result));
  assert.equal(this.result.kind, '', JSON.stringify(this.result));
  const envelope = JSON.parse(this.result.text);
  assert.equal(envelope.status, 'running', JSON.stringify(this.result));
  assert.equal(envelope.handle, this.result.handle, JSON.stringify(this.result));
});
