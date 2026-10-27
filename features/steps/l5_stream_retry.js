'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {Given, When, Then} = require('@cucumber/cucumber');

const root = process.cwd();
const fixture = path.join(root, 'features/steps/l5_stream_retry_test.go.txt');
let cached = null;

// One go test run of the acceptance fixture, added to ./provider through an overlay.
function run() {
  if (cached) return cached;
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'l5-stream-retry-'));
  try {
    const overlay = path.join(d, 'overlay.json');
    fs.writeFileSync(overlay, JSON.stringify({Replace: {[path.join(root, 'provider/l5_stream_retry_accept_test.go')]: fixture}}));
    const r = spawnSync('go', ['test', '-json', '-count=1', '-timeout=120s', '-overlay', overlay, './provider', '-run', '^TestL5StreamRetry$'], {
      cwd: root, encoding: 'utf8', timeout: 240000, maxBuffer: 64 * 1024 * 1024,
      env: {...process.env, GOTOOLCHAIN: 'local', GOPROXY: 'off', GOSUMDB: 'off'},
    });
    assert.equal(r.error, undefined);
    const events = r.stdout.split('\n').filter(Boolean).map(l => JSON.parse(l));
    const out = {};
    for (const e of events) {
      if (e.Test && e.Test.startsWith('TestL5StreamRetry/')) {
        const n = e.Test.slice('TestL5StreamRetry/'.length);
        if (['pass', 'fail', 'skip'].includes(e.Action)) out[n] = {...(out[n] || {}), action: e.Action};
        if (e.Action === 'output') out[n] = {...(out[n] || {}), log: ((out[n] || {}).log || '') + e.Output};
      }
    }
    cached = {status: r.status, stderr: r.stderr, cases: out};
  } finally {
    fs.rmSync(d, {recursive: true, force: true});
  }
  return cached;
}

Given('the Anthropic stream retry fixture is present', function () {
  assert.ok(fs.statSync(fixture).isFile());
});
When('the Anthropic stream retry cases run against the provider package', {timeout: 300000}, function () {
  this.l5 = run();
  assert.ok(Object.keys(this.l5.cases).length > 0, 'no subtests ran: ' + this.l5.stderr);
});
Then('the Anthropic stream retry case {string} passes', function (name) {
  const c = this.l5.cases[name];
  assert.ok(c, 'case did not run: ' + name);
  assert.equal(c.action, 'pass', name + ' did not pass:\n' + (c.log || ''));
});
