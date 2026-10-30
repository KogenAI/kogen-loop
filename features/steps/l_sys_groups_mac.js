'use strict';
// l-sys-groups-mac acceptance. The Go fixture l_sys_groups_mac_test.go.txt is overlaid
// into package sys (go test -overlay); nothing is written into the checkout.
// Controls: node features/steps/l_sys_groups_mac.js --control good|bad runs the same
// fixture against a known-good and a known-bad (unfixed) sys/lifeline.go.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = process.cwd();
const steps = __dirname;
const owned = [];
const NAME = 'TestLSysGroupsMacAcceptance';
const PKG = 'kogen-loop/sys';
const EXPECTED = {alone: {others: false, error: ''}, member: {others: true, error: ''}};
const UNFIXED = {alone: {others: true, error: ''}, member: {others: true, error: ''}};
// sys/run_context_test.go as of 16f8974; the fix must not edit or weaken it.
const RUN_CONTEXT_SHA256 = '9557487d0382df3ceec1fa9013464b1d7b51082f7ceed99a6878789ebdaa7fcc';
// time.Sleep calls in the non-test sys sources before the fix (sweepGroup, Terminate, sweepOwnGroup).
const SLEEPS_BEFORE = 3;

function temp() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'l-sys-groups-mac-')); fs.chmodSync(d, 0o700); owned.push(d); return d; }
function cleanup() { for (const d of owned) fs.rmSync(d, {recursive: true, force: true}); owned.length = 0; }
// Keep the caller's HOME and PATH: toolchain shims (mise) resolve go through them.
function goEnv() { return {...process.env, LC_ALL: 'C', GOENV: 'off', GOTOOLCHAIN: 'local', GOPROXY: 'off', GOSUMDB: 'off'}; }
function go(args, timeout) {
  const r = spawnSync('go', args, {cwd: root, env: goEnv(), encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024});
  return {command: 'go ' + args.join(' '), status: r.status, signal: r.signal, error: r.error ? r.error.message : null, stdout: r.stdout || '', stderr: r.stderr || ''};
}

function execute(variant) {
  const replace = {[path.join(root, 'sys/l_sys_groups_mac_acceptance_test.go')]: path.join(steps, 'l_sys_groups_mac_test.go.txt')};
  if (variant) replace[path.join(root, 'sys/lifeline.go')] = path.join(steps, 'l_sys_groups_mac_' + variant + '_lifeline.go.txt');
  const overlay = path.join(temp(), 'overlay.json');
  fs.writeFileSync(overlay, JSON.stringify({Replace: replace}), {mode: 0o600});
  return go(['test', '-json', '-count=1', '-timeout=120s', '-overlay', overlay, './sys', '-run', '^' + NAME + '$'], 170000);
}

function report(r) {
  const why = '`' + r.command + '`\n' + r.stdout + r.stderr;
  assert.equal(r.error, null, 'process.error ' + why);
  assert.equal(r.signal, null, 'process.signal ' + why);
  assert.equal(r.status, 0, 'process.status ' + why);
  assert.equal(r.stderr, '', 'process.stderr ' + why);
  const events = r.stdout.trim().split('\n').map(x => JSON.parse(x));
  assert.ok(events.length > 0, 'events.empty');
  assert.ok(events.every(x => x.Package === PKG), 'events.package ' + why);
  assert.ok(!events.some(x => ['skip', 'fail'].includes(x.Action)), 'events.fail-or-skip ' + why);
  const count = (a, t) => events.filter(x => x.Action === a && x.Test === t).length;
  assert.equal(count('start', undefined), 1, 'events.start');
  assert.equal(count('pass', undefined), 1, 'events.package-pass');
  assert.equal(count('run', NAME), 1, NAME + ' did not run once ' + why);
  assert.equal(count('pass', NAME), 1, NAME + ' did not pass once ' + why);
  const lines = events.filter(x => x.Action === 'output' && x.Test === NAME).map(x => x.Output || '').join('').split('\n').filter(x => x.startsWith('LSGM '));
  assert.equal(lines.length, 1, 'payload.count ' + why);
  return JSON.parse(lines[0].slice(5));
}
function equal(actual, expected) { assert.deepEqual(actual, expected, 'payload.exact'); }

// Runs one named test of a package in its own go test process and reports what happened to it.
function runNamed(name, pkg) {
  const r = go(['test', '-json', '-count=1', '-timeout=120s', '-run', '^' + name + '$', pkg], 170000);
  const events = r.stdout.split('\n').filter(x => x.startsWith('{')).map(x => JSON.parse(x));
  const n = a => events.filter(x => x.Action === a && x.Test === name).length;
  const out = events.filter(x => x.Action === 'output').map(x => x.Output || '').join('');
  return {...r, ran: n('run'), passed: n('pass'), failed: n('fail'), skipped: n('skip'), out};
}

function control(kind) {
  if (kind === 'good') {
    equal(report(execute('good')), EXPECTED);
    process.stdout.write('l-sys-groups-mac observer good\n');
    return;
  }
  const reject = fn => { let caught; try { fn(); } catch (e) { caught = e; } assert.ok(caught, 'negative missed assertion'); };
  // The real unfixed listing counts its own ps row as a member of a lone group.
  const bad = report(execute('bad'));
  equal(bad, UNFIXED);
  reject(() => equal(bad, EXPECTED));
  // The report parser rejects broken runs independently of the fixture outcome.
  const event = (Action, Output) => ({Package: PKG, Action, ...(Action === 'start' ? {} : {Test: NAME}), ...(Output ? {Output} : {})});
  const synthetic = v => {
    const line = 'LSGM ' + JSON.stringify(v) + '\n';
    const es = [event('start'), event('run'), event('output', line.slice(0, 7)), event('output', line.slice(7)), event('pass'), {Package: PKG, Action: 'pass'}];
    return {command: 'synthetic', status: 0, signal: null, error: null, stderr: '', stdout: es.map(x => JSON.stringify(x)).join('\n') + '\n'};
  };
  equal(report(synthetic(EXPECTED)), EXPECTED);
  for (const mutate of [r => r.status = 1, r => r.signal = 'SIGKILL', r => r.error = 'watchdog', r => r.stderr = 'compile error',
    r => r.stdout = 'compile error', r => r.stdout += JSON.stringify(event('skip')) + '\n', r => r.stdout += JSON.stringify(event('fail')) + '\n',
    r => r.stdout += JSON.stringify(event('output', 'LSGM {}\n')) + '\n',
    r => r.stdout = r.stdout.split('\n').filter((_, i) => i !== 3).join('\n')]) {
    const r = synthetic(EXPECTED); mutate(r); reject(() => report(r));
  }
  process.stdout.write('l-sys-groups-mac observer bad rejected\n');
  process.exitCode = 1;
}

if (require.main === module) {
  try { assert.equal(process.argv[2], '--control'); assert.ok(['good', 'bad'].includes(process.argv[3])); control(process.argv[3]); }
  catch (e) { console.error(e.stack); process.exitCode = 2; } finally { cleanup(); }
} else {
  const {Given, When, Then, AfterAll} = require('@cucumber/cucumber');

  When('I observe a lone group and a group with a live sleep child through the ps listing', {timeout: 180000}, function () {
    this.lsgm = execute(null);
  });
  Then('the ps listing observations are exactly:', function (s) { equal(report(this.lsgm), JSON.parse(s)); });

  Given('the existing live-groups test file is unchanged', function () {
    const sum = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'sys/run_context_test.go'))).digest('hex');
    assert.equal(sum, RUN_CONTEXT_SHA256, 'sys/run_context_test.go (TestLiveGroupsAndRetireKeepALeftoverGroup) was edited');
  });
  When('I run the Go test {string} in package {string} in {int} separate runs', {timeout: 900000}, function (name, pkg, times) {
    this.lsgmRuns = {name, runs: Array.from({length: times}, () => runNamed(name, pkg))};
  });
  Then('each of those runs passed that test', function () {
    const {name, runs} = this.lsgmRuns;
    runs.forEach((r, i) => {
      const what = name + ' run ' + (i + 1) + '/' + runs.length + ': `' + r.command + '` exited ' + r.status + (r.signal ? ' (' + r.signal + ')' : '') +
        '; run=' + r.ran + ' pass=' + r.passed + ' fail=' + r.failed + ' skip=' + r.skipped + (r.ran === 0 ? ' (test absent or never ran)' : '') + '\n' + r.out + r.stderr;
      assert.equal(r.error, null, what + '\n' + r.error);
      assert.equal(r.status, 0, what);
      assert.equal(r.ran, 1, what);
      assert.equal(r.passed, 1, what);
      assert.equal(r.failed + r.skipped, 0, what);
    });
  });

  When('I run the whole Go package {string} once', {timeout: 420000}, function (pkg) {
    this.lsgmPkg = go(['test', '-count=1', '-timeout=360s', pkg], 400000);
  });
  Then('the Go package run passed', function () {
    const r = this.lsgmPkg;
    const what = '`' + r.command + '` exited ' + r.status + (r.signal ? ' (' + r.signal + ')' : '') + '\n' + r.stdout + r.stderr;
    assert.equal(r.error, null, what);
    assert.equal(r.status, 0, what);
    assert.match(r.stdout, /^ok\s+kogen-loop\/sys\s/m, what);
  });
  Then('the production files in sys add no sleep and the module adds no dependency', function () {
    const counts = {};
    for (const f of fs.readdirSync(path.join(root, 'sys')).filter(f => f.endsWith('.go') && !f.endsWith('_test.go')).sort()) {
      const n = (fs.readFileSync(path.join(root, 'sys', f), 'utf8').match(/time\.Sleep\(/g) || []).length;
      if (n) counts[f] = n;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    assert.ok(total <= SLEEPS_BEFORE, 'time.Sleep calls in sys production files: ' + JSON.stringify(counts) + ', at most ' + SLEEPS_BEFORE + ' allowed');
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'go.mod'), 'utf8'), /^\s*require\b/m, 'go.mod gained a module dependency');
  });
  AfterAll(cleanup);
}
