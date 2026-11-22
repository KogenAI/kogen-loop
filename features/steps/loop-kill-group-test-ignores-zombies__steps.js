'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = process.cwd();
const HARNESS = 'features/steps/loop-kill-group-test-ignores-zombies__driver/harness.go.txt';
const owned = [];
function cleanup() { for (const d of owned) fs.rmSync(d, {recursive: true, force: true}); owned.length = 0; }
function execute(kase, run) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lkgtiz-')); owned.push(d);
  const overlay = path.join(d, 'overlay.json');
  fs.writeFileSync(overlay, JSON.stringify({Replace: {[path.join(root, 'contract/zz_wgacc_test.go')]: path.join(root, HARNESS)}}), {mode: 0o600});
  const r = spawnSync('go', ['test', '-json', '-count=1', '-timeout=100s', '-overlay', overlay, './contract', '-run', run], {
    env: {...process.env, GOENV: 'off', GOTOOLCHAIN: 'local', GOPROXY: 'off', GOSUMDB: 'off', WGACC_CASE: kase},
    encoding: 'utf8', timeout: 110000, maxBuffer: 16 * 1024 * 1024});
  const events = (r.stdout || '').split('\n').filter(x => x.startsWith('{')).map(x => JSON.parse(x));
  const output = events.filter(e => e.Action === 'output').map(e => e.Output || '').join('');
  const actions = (name) => events.filter(e => e.Test === name).map(e => e.Action);
  return {status: r.status, error: r.error ? r.error.message : null, output, actions, stderr: r.stderr || ''};
}
function wgLine(r, kase) { const m = r.output.match(new RegExp('^WG ' + kase + ' returned (\\d+)$', 'm')); return m ? Number(m[1]) : null; }
function judgeReturned(r, kase, name, limitMs) {
  assert.equal(r.error, null, 'process.error');
  assert.equal(r.status, 0, 'helper must return without failure for ' + kase + '\n' + r.output + r.stderr);
  assert.deepEqual(r.actions(name).filter(a => a === 'pass' || a === 'fail' || a === 'skip'), ['pass'], name + ' must pass\n' + r.output);
  const ms = wgLine(r, kase);
  assert.notEqual(ms, null, 'no WG line for ' + kase + '\n' + r.output);
  assert.ok(ms < limitMs, 'the helper took ' + ms + ' ms for ' + kase + ', limit ' + limitMs);
}
function judgeRemains(r, name) {
  assert.equal(r.error, null, 'process.error');
  assert.notEqual(r.status, 0, 'the helper must fail for a running member\n' + r.output);
  assert.deepEqual(r.actions(name).filter(a => a === 'pass' || a === 'fail' || a === 'skip'), ['fail'], name + ' must fail\n' + r.output);
  assert.equal(wgLine(r, 'running'), null, 'the helper returned for a running member\n' + r.output);
  assert.ok(/the running group remains: /.test(r.output), 'no "remains" message\n' + r.output);
  assert.ok(!/fixture:/.test(r.output), 'fixture failure\n' + r.output);
}
function judgeExisting(r) {
  assert.equal(r.error, null, 'process.error');
  assert.equal(r.status, 0, 'the existing tests must pass\n' + r.output + r.stderr);
  for (const n of ['TestRunTimeout', 'TestRunInterruptStopsTheCommandAndRefusesLaterOnes']) {
    assert.deepEqual(r.actions(n).filter(a => a === 'pass' || a === 'fail' || a === 'skip'), ['pass'], n + ' must pass\n' + r.output);
  }
}
function control(kind) {
  const ev = (Test, Action, Output) => ({Action, Test, ...(Output ? {Output} : {})});
  const mk = (name, status, extra) => {
    const events = [ev(name, 'run'), ...extra, ev(name, status ? 'fail' : 'pass')];
    const output = events.filter(e => e.Action === 'output').map(e => e.Output).join('');
    return {status, error: null, stderr: '', output, actions: n => events.filter(e => e.Test === n).map(e => e.Action)};
  };
  judgeReturned(mk('TestWGAcceptance', 0, [ev('TestWGAcceptance', 'output', 'WG zombie returned 40\n')]), 'zombie', 'TestWGAcceptance', 2000);
  judgeRemains(mk('TestWGAcceptance', 1, [ev('TestWGAcceptance', 'output', 'the running group remains: <nil>\n')]), 'TestWGAcceptance');
  if (kind === 'bad') {
    const reject = fn => { let c; try { fn(); } catch (e) { c = e; } assert.ok(c, 'missed'); };
    reject(() => judgeReturned(mk('TestWGAcceptance', 0, [ev('TestWGAcceptance', 'output', 'WG zombie returned 10040\n')]), 'zombie', 'TestWGAcceptance', 2000));
    reject(() => judgeReturned(mk('TestWGAcceptance', 1, [ev('TestWGAcceptance', 'output', 'WG zombie returned 40\n')]), 'zombie', 'TestWGAcceptance', 2000));
    reject(() => judgeRemains(mk('TestWGAcceptance', 0, [ev('TestWGAcceptance', 'output', 'WG running returned 3\n')]), 'TestWGAcceptance'));
    reject(() => judgeRemains(mk('TestWGAcceptance', 1, [ev('TestWGAcceptance', 'output', 'fixture: broken\n')]), 'TestWGAcceptance'));
    process.stdout.write('lkgtiz observer bad rejected\n');
    process.exitCode = 1;
  } else process.stdout.write('lkgtiz observer good\n');
}
if (require.main === module) {
  try { assert.equal(process.argv[2], '--control'); assert.ok(['good', 'bad'].includes(process.argv[3])); control(process.argv[3]); }
  catch (e) { console.error(e.stack); process.exitCode = 2; }
} else {
  const {Given, When, Then, AfterAll} = require('@cucumber/cucumber');
  const P = 'loop-kill-group-test-ignores-zombies: ';
  Given(P + 'the contract tests define the group helper waitGone', function () {
    assert.ok(/^func waitGone\(t \*testing\.T, pgid int, what string\)/m.test(fs.readFileSync(path.join(root, 'contract/sys_test.go'), 'utf8')));
  });
  When(P + 'the helper waits for a group whose only member is an unreaped zombie', {timeout: 115000}, function () {
    if (process.platform === 'linux') this.r = execute('zombie', '^TestWGAcceptance$');
    else this.src = fs.readFileSync(path.join(root, 'contract/sys_test.go'), 'utf8');
  });
  Then(P + 'the helper returns within 2 seconds with no failure', function () {
    if (process.platform === 'linux') return judgeReturned(this.r, 'zombie', 'TestWGAcceptance', 2000);
    // Zombie state is read from /proc, which this system lacks; here the helper can only be checked by its source.
    const i = this.src.indexOf('func waitGone');
    assert.ok(i >= 0 && this.src.slice(i, i + 2200).includes('/proc/'), 'the helper does not read the proc stat file');
  });
  When(P + 'the helper waits for a group with a running member', {timeout: 115000}, function () { this.r = execute('running', '^TestWGAcceptance$'); });
  Then(P + 'the helper fails with its remains message', function () { judgeRemains(this.r, 'TestWGAcceptance'); });
  When(P + 'the timed-out and interrupted group tests run and the helper waits for a vanished group', {timeout: 115000}, function () {
    this.r = execute('', '^(TestRunTimeout|TestRunInterruptStopsTheCommandAndRefusesLaterOnes)$');
    this.g = execute('gone', '^TestWGAcceptance$');
  });
  Then(P + 'both existing tests pass and the vanished group counts as gone within 2 seconds', function () {
    judgeExisting(this.r);
    judgeReturned(this.g, 'gone', 'TestWGAcceptance', 2000);
  });
  AfterAll(cleanup);
}
