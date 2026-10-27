'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = process.cwd();
const owned = [];
const NAME = 'TestKSafeAcceptance';
function temp() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'k-safe-')); fs.chmodSync(d, 0o700); owned.push(d); return d; }
function cleanup() { for (const d of owned) fs.rmSync(d, {recursive: true, force: true}); owned.length = 0; }
function execute(config) {
  const d = temp();
  const overlay = path.join(d, 'overlay.json');
  fs.writeFileSync(overlay, JSON.stringify({Replace: {
    [path.join(root, 'conformance/k_safe_process_groups_acceptance_test.go')]: path.join(root, 'features/steps/k_safe_process_groups_test.go.txt')
  }}), {mode: 0o600});
  // Keep the caller's HOME and PATH: toolchain shims (mise) resolve go through them.
  const r = spawnSync('go', ['test', '-json', '-count=1', '-timeout=90s', '-overlay', overlay, './conformance', '-run', '^' + NAME + '$'], {
    env: {...process.env, LC_ALL: 'en_US.UTF-8', GOENV: 'off', GOTOOLCHAIN: 'local', GOPROXY: 'off', GOSUMDB: 'off', KSAFE_CASE: JSON.stringify(config)},
    encoding: 'utf8', timeout: 150000, maxBuffer: 16 * 1024 * 1024});
  return {status: r.status, signal: r.signal, error: r.error ? r.error.message : null, stdout: r.stdout || '', stderr: r.stderr || ''};
}
function report(r) {
  assert.equal(r.error, null, 'process.error');
  assert.equal(r.signal, null, 'process.signal');
  assert.equal(r.status, 0, 'process.status\n' + r.stdout + r.stderr);
  assert.equal(r.stderr, '', 'process.stderr');
  const events = r.stdout.trim().split('\n').map(x => JSON.parse(x));
  assert.ok(events.length > 0, 'events.empty');
  assert.ok(events.every(x => x.Package === 'kogen-loop/conformance'), 'events.package');
  assert.ok(!events.some(x => ['skip', 'fail'].includes(x.Action)), 'events.fail-or-skip');
  const count = (a, t) => events.filter(x => x.Action === a && x.Test === t).length;
  assert.equal(count('start', undefined), 1);
  assert.equal(count('pass', undefined), 1);
  assert.equal(count('run', NAME), 1);
  assert.equal(count('pass', NAME), 1);
  const lines = events.filter(x => x.Action === 'output' && x.Test === NAME).map(x => x.Output || '').join('').split('\n').filter(x => x.startsWith('KSAFE '));
  assert.equal(lines.length, 1, 'payload.count');
  return JSON.parse(lines[0].slice(6));
}
function equal(actual, expected) { assert.deepEqual(actual, expected, 'payload.exact'); }
function control(kind) {
  const want = {a: true, b: 'x', c: 1};
  const event = (Action, Output) => ({Package: 'kogen-loop/conformance', Action, ...(Action === 'start' ? {} : {Test: NAME}), ...(Output ? {Output} : {})});
  function synthetic(v) {
    const line = 'KSAFE ' + JSON.stringify(v) + '\n';
    const es = [event('start'), event('run'), event('output', line.slice(0, 9)), event('output', line.slice(9)), event('pass'), {Package: 'kogen-loop/conformance', Action: 'pass'}];
    return {status: 0, signal: null, error: null, stderr: '', stdout: es.map(x => JSON.stringify(x)).join('\n') + '\n'};
  }
  equal(report(synthetic(want)), want);
  if (kind === 'bad') {
    const reject = fn => { let caught; try { fn(); } catch (e) { caught = e; } assert.ok(caught, 'negative missed assertion'); };
    for (const [k, v] of Object.entries(want)) {
      reject(() => equal(report(synthetic({...want, [k]: typeof v === 'boolean' ? !v : typeof v === 'number' ? v + 1 : v + '!'})), want));
    }
    for (const mutate of [r => r.status = 1, r => r.signal = 'SIGKILL', r => r.error = 'watchdog', r => r.stderr = 'compile error',
      r => r.stdout = 'compile error', r => r.stdout += JSON.stringify(event('skip')) + '\n',
      r => r.stdout += JSON.stringify(event('output', 'KSAFE {}\n')) + '\n',
      r => r.stdout = r.stdout.split('\n').filter((_, i) => i !== 3).join('\n')]) {
      const r = synthetic(want); mutate(r); reject(() => report(r));
    }
    process.stdout.write('k-safe observer bad rejected\n');
    process.exitCode = 1;
  } else process.stdout.write('k-safe observer good\n');
}
if (require.main === module) {
  try { assert.ok(['good', 'bad'].includes(process.argv[3])); assert.equal(process.argv[2], '--control'); control(process.argv[3]); }
  catch (e) { console.error(e.stack); process.exitCode = 2; } finally { cleanup(); }
} else {
  const {Given, When, Then, AfterAll} = require('@cucumber/cucumber');
  Given('k-safe inputs are:', function (s) { this.ks = JSON.parse(s); });
  When('I exercise k-safe process groups', {timeout: 160000}, function () { this.ksResult = execute(this.ks); });
  Then('k-safe reports exactly:', function (s) { equal(report(this.ksResult), JSON.parse(s)); });
  AfterAll(cleanup);
}
