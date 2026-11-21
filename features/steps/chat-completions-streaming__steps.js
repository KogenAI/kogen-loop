'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');

When('chat-completions-streaming: I run the provider test {string}', {timeout: 110000}, function (name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-stream-'));
  fs.cpSync(process.cwd(), dir, {recursive: true, filter: src => !/(^|\/)(\.git|bin)$/.test(src)});
  fs.copyFileSync(path.join(process.cwd(), 'features/steps/chat-completions-streaming__driver/stream_driver_test.go.txt'), path.join(dir, 'provider', 'zz_chat_stream_driver_test.go'));
  this.csName = name;
  this.csCommand = `go test -json ./provider -run ^${name}$ -count=1 -timeout=90s`;
  this.csResult = spawnSync('go', ['test', '-json', './provider', '-run', '^' + name + '$', '-count=1', '-timeout=90s'], {cwd: dir, encoding: 'utf8', timeout: 100000, maxBuffer: 32 * 1024 * 1024});
  fs.rmSync(dir, {recursive: true, force: true});
});

Then('chat-completions-streaming: the provider test ran and passed', function () {
  const r = this.csResult;
  const detail = `Required test ${this.csName} in ./provider; command ${this.csCommand}; status ${r.status}; error ${r.error || 'none'}\n${r.stdout}\n${r.stderr}`;
  assert.ok(!r.error, detail);
  const events = r.stdout.split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l));
  const actions = events.filter(e => e.Test === this.csName && ['pass', 'fail', 'skip'].includes(e.Action)).map(e => e.Action);
  assert.deepEqual(actions, ['pass'], `Test ${this.csName} was absent, skipped, failed or ran zero times: ${detail}`);
  assert.equal(r.status, 0, detail);
});
