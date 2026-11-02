'use strict';
// Steps for L-SHELL-WAIT-SEAM-REST: the remaining shell-wait tests (TestShellLifecycleYieldSnapshot,
// TestShellYieldLargeJSON, TestShellRetrievalCancellationStopsCommand) run on the controlled-time
// seam tools.Tools.ShellAfter, each still fails on a deliberately broken implementation, and no
// test in the whole suite waits out the real shell wait. Broken implementations are built only in
// private copies of the tree.
//
// The whole acceptance must end within two minutes, also on a tree whose tests still wait out the
// real shell wait. Each go test run therefore has a watchdog: once any test (one without subtests)
// has run longer than the scenario's limit, the run is stopped and reported. A test binary stopped
// mid-test cannot run its cleanups, so every run gets a private temporary directory (as TMPDIR
// and GOTMPDIR, where this Go roots t.TempDir) and, when it ends, every process still working in
// that directory is killed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');

// Each mutation replaces anchors that must occur exactly once in the named file.
const MUTATIONS = {
  // The running envelope is no longer bounded.
  'unbounded envelope': [['tools/tools.go', 'if len(raw) > maxResult {', 'if false {']],
  // Bounding the envelope ignores JSON escaping: the output is cut by its raw size only.
  'escaping ignored': [['tools/tools.go', 'if len(b) <= maxResult {', 'if len(b) >= 0 {']],
  // A cancelled or expired shell wait returns without stopping the command.
  'cancel keeps command': [['tools/tools.go', '\tcase <-done:\n\t\tj.cancel()\n\t\t<-j.cmd.Done()\n', '\tcase <-done:\n']],
  // A round returns without stopping the commands and groups it started.
  'no round cleanup': [['loop/loop.go', 'defer custody(rd.Tools.Session)()', '_ = rd.Tools.Session'], ['loop/loop.go', 'defer rd.Tools.EndShellRound()', '_ = rd.Tools']],
};
// A run still going after this many seconds is stopped whatever its tests do.
const RUN_LIMIT = 100;

function copyTree(from, to) {
  for (const entry of fs.readdirSync(from, {withFileTypes:true})) {
    if (entry.name === '.git') continue;
    const a = path.join(from, entry.name), b = path.join(to, entry.name);
    if (entry.isDirectory()) { fs.mkdirSync(b); copyTree(a, b); }
    else if (entry.isFile()) fs.copyFileSync(a, b);
  }
}
function privateCopy(dirs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-shell-wait-seam-rest-'));
  dirs.push(dir);
  copyTree(process.cwd(), dir);
  return dir;
}
function mutate(dir, name) {
  const edits = MUTATIONS[name];
  assert.ok(edits, 'unknown mutation ' + name);
  for (const [file, anchor, replacement] of edits) {
    const p = path.join(dir, file);
    const text = fs.readFileSync(p, 'utf8');
    const count = text.split(anchor).length - 1;
    assert.equal(count, 1, 'mutation "' + name + '": anchor ' + JSON.stringify(anchor) + ' occurs ' + count + ' times in ' + file + '; the acceptance needs it exactly once');
    fs.writeFileSync(p, text.replace(anchor, replacement));
  }
}
const sleepSync = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
// processesIn lists this user's live processes whose working directory is dir or below it.
function processesIn(dir) {
  const found = [];
  const inside = c => c === dir || c.startsWith(dir + path.sep);
  if (fs.existsSync('/proc/self/cwd')) {
    for (const p of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(p)) continue;
      try { if (inside(fs.readlinkSync('/proc/' + p + '/cwd'))) found.push(Number(p)); } catch (_) {}
    }
    return found;
  }
  const lsof = fs.existsSync('/usr/sbin/lsof') ? '/usr/sbin/lsof' : 'lsof';
  const r = spawnSync(lsof, ['-a', '-d', 'cwd', '-u', String(process.getuid()), '-F', 'pn'], {encoding:'utf8', timeout:30000, maxBuffer:64 << 20});
  let pid = 0;
  for (const line of (r.stdout || '').split('\n')) {
    if (line[0] === 'p') pid = Number(line.slice(1));
    else if (line[0] === 'n' && inside(line.slice(1))) found.push(pid);
  }
  return found;
}
// reap kills every process still working in a run's private temporary directory, then removes
// it. It returns the processes that survived, which should be none.
function reap(dir) {
  let left = processesIn(dir);
  for (let i = 0; i < 50 && left.length; i++) {
    for (const pid of left) { try { process.kill(pid, 'SIGKILL'); } catch (_) {} }
    sleepSync(100);
    left = processesIn(dir);
  }
  fs.rmSync(dir, {recursive:true, force:true});
  return left;
}
// goTest runs go test -json with a private TMPDIR and GOTMPDIR, keeps every test's final action
// and elapsed time, stops the run once a test without subtests has run over limit seconds, and
// reaps it.
function goTest(cwd, args, limit, quiet) {
  return new Promise(resolve => {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'l-shell-wait-seam-rest-tmp-')));
    const argv = ['test', '-count=1', '-json', '-timeout', RUN_LIMIT + 's', ...args];
    const started = Date.now();
    const run = {command:'go ' + argv.join(' '), cwd, status:null, error:'', stopped:'', wall:0, tests:{}, ran:{}, output:{}, raw:'', survivors:[]};
    const active = {}, parents = new Set();
    let pending = '', finished = false;
    const child = spawn('go', argv, {cwd, env:{...process.env, TMPDIR:tmp, GOTMPDIR:tmp}, detached:true, stdio:['ignore', 'pipe', 'pipe']});
    const stop = why => {
      if (run.stopped) return;
      run.stopped = why;
      try { process.kill(-child.pid, 'SIGKILL'); } catch (_) {}
    };
    const onLine = line => {
      if (!line.startsWith('{')) return;
      let e; try { e = JSON.parse(line); } catch (_) { return; }
      if (!e.Test) return;
      const key = e.Package + ' ' + e.Test;
      for (let i = e.Test.indexOf('/'); i !== -1; i = e.Test.indexOf('/', i + 1)) parents.add(e.Package + ' ' + e.Test.slice(0, i));
      if (e.Action === 'run' || e.Action === 'cont') { run.ran[key] = true; active[key] = Date.now(); }
      if (e.Action === 'pause') delete active[key];
      if (e.Action === 'output') run.output[key] = (run.output[key] || '') + e.Output;
      if (['pass', 'fail', 'skip'].includes(e.Action)) { run.tests[key] = {action:e.Action, elapsed:e.Elapsed}; delete active[key]; }
    };
    child.stdout.on('data', d => {
      run.raw += d; pending += d;
      for (let i; (i = pending.indexOf('\n')) >= 0; pending = pending.slice(i + 1)) onLine(pending.slice(0, i));
    });
    child.stderr.on('data', d => { run.raw += d; });
    const tick = setInterval(() => {
      const now = Date.now();
      for (const [key, since] of Object.entries(active)) {
        if (!parents.has(key) && now - since > (limit + 1) * 1000) { stop(key + ' was still running after ' + limit + ' s, so the run was stopped'); return; }
      }
      if (now - started > RUN_LIMIT * 1000) stop('the run was still going after ' + RUN_LIMIT + ' s, so it was stopped');
    }, 200);
    const finish = () => {
      if (finished) return;
      finished = true;
      clearInterval(tick);
      if (pending) onLine(pending);
      run.wall = (Date.now() - started) / 1000;
      run.survivors = reap(tmp);
      if (!quiet) console.log(run.command + ' in ' + cwd + ': ' + run.wall.toFixed(1) + ' s wall, exit ' + run.status + (run.stopped ? '; ' + run.stopped : '') + (run.error ? ', ' + run.error : ''));
      resolve(run);
    };
    child.on('error', err => { run.error = String(err); finish(); });
    child.on('exit', status => { run.status = status; setTimeout(finish, 2000); });
    child.on('close', status => { if (run.status === null) run.status = status; finish(); });
  });
}
function header(run) {
  return 'command: ' + run.command + ' in ' + run.cwd + ' (exit ' + run.status + (run.error ? ', ' + run.error : '') + ', ' + run.wall.toFixed(1) + ' s wall)';
}
// runProblems are the reasons a run itself is unusable: stopped by the watchdog, a go test
// timeout, or processes that survived reaping.
function runProblems(run) {
  const problems = [];
  if (run.stopped) problems.push(run.stopped);
  if (run.error) problems.push('the run failed: ' + run.error);
  const m = /panic: test timed out[\s\S]*?running tests:[\s\S]*?(?=\n\n|$)/.exec(run.raw) || /panic: test timed out.*/.exec(run.raw);
  if (m) problems.push('a package hit the go test timeout:\n' + m[0]);
  if (run.survivors.length) problems.push('processes survived the run: ' + run.survivors.join(' '));
  return problems;
}
// describe reports one listed test: whether it ran, its outcome, elapsed time and result lines.
function describe(run, test, pkg) {
  const key = pkg + ' ' + test, got = run.tests[key];
  let line = test + ' in package ' + pkg + ': ';
  if (!run.ran[key]) line += 'did not run (absent or zero runs)';
  else if (!got) line += 'ran (=== RUN ' + test + ') but reported no result: still running when the run was stopped';
  else line += 'ran, outcome ' + got.action + ' after ' + got.elapsed + ' s';
  const result = (run.output[key] || '').split('\n').filter(l => /^\s*--- (PASS|FAIL|SKIP): /.test(l)).map(l => l.trim()).join('; ');
  if (result) line += ' (' + result + ')';
  return {got, line, out:(run.output[key] || '').split('\ngoroutine ')[0].trimEnd()};
}
// judge checks every listed test with ok(got) and fails with the whole picture when any is wrong.
function judge(run, rows, ok, want) {
  const lines = [], bad = [];
  for (const [test, pkg] of rows) {
    const {got, line, out} = describe(run, test, pkg);
    const good = got && ok(got);
    if (!good) bad.push(line + '\n' + out);
    lines.push((good ? 'ok   ' : 'FAIL ') + line);
  }
  const problems = runProblems(run);
  assert.ok(bad.length === 0 && problems.length === 0, header(run) + '; ' + want + ':\n' + lines.join('\n') + (problems.length ? '\n\n' + problems.join('\n') : '') + (bad.length ? '\n\n' + bad.join('\n\n') : ''));
}
// allPassed: each listed test ran and passed within the given seconds.
function allPassed(run, rows, seconds) {
  judge(run, rows, got => got.action === 'pass' && got.elapsed <= seconds, 'each test must pass within ' + seconds + ' s');
}
// allFailed: on a broken implementation each listed test ran and failed by its own assertion
// within the given seconds, never by the go test timeout or the watchdog.
function allFailed(run, rows, seconds) {
  judge(run, rows, got => got.action === 'fail' && got.elapsed <= seconds, 'on the broken implementation each test must fail by its own assertion within ' + seconds + ' s');
}
// suiteBounded: the whole suite finished (no watchdog stop, go test timeout or build failure),
// the listed tests passed, and no test or subtest took the given seconds or more.
function suiteBounded(run, rows, seconds) {
  const problems = runProblems(run);
  const build = run.raw.split('\n').filter(l => /\[(build|setup) failed\]/.test(l));
  if (build.length) problems.push('build failures:\n' + build.join('\n'));
  if (Object.keys(run.tests).length === 0) problems.push('no test reported a result');
  for (const [test, pkg] of rows) {
    const {got, line, out} = describe(run, test, pkg);
    if (!got || got.action !== 'pass') problems.push(line + '\n' + out);
  }
  const slow = Object.entries(run.tests).filter(([, r]) => r.elapsed >= seconds).sort((a, b) => b[1].elapsed - a[1].elapsed).map(([k, r]) => k + ': ' + r.action + ' after ' + r.elapsed + ' s');
  if (slow.length) problems.push('tests that took ' + seconds + ' s or more:\n' + slow.join('\n'));
  assert.equal(problems.length, 0, header(run) + '; no test may take ' + seconds + ' s or more:\n' + problems.join('\n\n'));
}
// brokenRuns runs each [mutation, test, package dir] row on its own broken private copy, all at once.
async function brokenRuns(dirs, rows, limit, quiet) {
  const runs = {};
  await Promise.all(rows.map(async ([name, test, pkgDir]) => {
    const dir = privateCopy(dirs);
    mutate(dir, name);
    runs[name] = await goTest(dir, ['-run', '^' + test + '$', pkgDir], limit, quiet);
    runs[name].named = test;
  }));
  return runs;
}
// namedTest reports the test a broken run named with -run: its outcome and its first output lines.
function namedTest(run, pkg) {
  if (!run || !run.named) return '';
  const shown = (run.output[pkg + ' ' + run.named] || '').split('\n').slice(0, 20).join('\n').trimEnd();
  return 'named test ' + describe(run, run.named, pkg).line + (shown ? '\n' + shown : '') + '\n';
}
function failedByMutation(runs, rows, seconds) {
  const groups = {};
  for (const [name, test, pkg] of rows) (groups[name] = groups[name] || []).push([test, pkg]);
  const errors = [];
  for (const [name, tests] of Object.entries(groups)) {
    try { assert.ok(runs[name], 'mutation "' + name + '" was not run'); allFailed(runs[name], tests, seconds); }
    catch (e) { errors.push('mutation "' + name + '": ' + namedTest(runs[name], tests[0][1]) + e.message); }
  }
  assert.equal(errors.length, 0, errors.join('\n\n'));
}

// A control test that leaves a process working in its temporary directory, records its pid in
// linger.pid of the package directory, and then runs for a minute.
const LINGER = 'package tools\n\nimport (\n\t"os"\n\t"os/exec"\n\t"strconv"\n\t"syscall"\n\t"testing"\n\t"time"\n)\n\nfunc TestZZWatchdogControl(t *testing.T) {\n\tcmd := exec.Command("sh", "-c", "exec sleep 600")\n\tcmd.Dir = t.TempDir()\n\tcmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}\n\tif err := cmd.Start(); err != nil {\n\t\tt.Fatal(err)\n\t}\n\tif err := os.WriteFile("linger.pid", []byte(strconv.Itoa(cmd.Process.Pid)), 0600); err != nil {\n\t\tt.Fatal(err)\n\t}\n\ttime.Sleep(time.Minute)\n}\n';

async function control(mode) {
  // Shaping controls for the observer: node l_shell_wait_seam_rest.js --control good|bad, run from
  // the unchanged base tree. Good: every mutation anchor is present exactly once; real go test
  // output of a passing test is accepted by allPassed and suiteBounded, and of the same test on a
  // broken copy by allFailed and failedByMutation; a test running over its limit is stopped and the
  // process it left is reaped; matching records are accepted. Bad: wrong real and synthetic records,
  // a stopped run and a repeated anchor are rejected.
  const dirs = [];
  const fast = ['TestShellYieldLargeMalformedOutput', 'kogen-loop/tools'];
  const runFast = dir => goTest(dir, ['-run', '^' + fast[0] + '$', './tools'], 10, true);
  const lingering = async () => {
    const dir = privateCopy(dirs);
    fs.writeFileSync(path.join(dir, 'tools', 'zz_watchdog_control_test.go'), LINGER);
    const run = await goTest(dir, ['-run', '^TestZZWatchdogControl$', './tools'], 2, true);
    run.lingerPid = Number(fs.readFileSync(path.join(dir, 'tools', 'linger.pid'), 'utf8'));
    return run;
  };
  const record = (entries, raw = '', extra = {}) => {
    const r = {command:'go test (control)', cwd:'control', status:0, error:'', stopped:'', wall:1, tests:{}, ran:{}, output:{}, raw, survivors:[], ...extra};
    for (const [key, action, elapsed] of entries) { r.ran['p ' + key] = true; if (action) r.tests['p ' + key] = {action, elapsed}; }
    return r;
  };
  try {
    if (mode === 'good') {
      for (const name of Object.keys(MUTATIONS)) mutate(privateCopy(dirs), name);
      const good = await runFast(process.cwd());
      allPassed(good, [fast], 10);
      suiteBounded(good, [fast], 30);
      const broken = await brokenRuns(dirs, [['unbounded envelope', fast[0], './tools']], 20, true);
      allFailed(broken['unbounded envelope'], [fast], 20);
      failedByMutation(broken, [['unbounded envelope', ...fast]], 20);
      const stopped = await lingering();
      assert.ok(stopped.stopped.startsWith('kogen-loop/tools TestZZWatchdogControl was still running after 2 s'), 'watchdog: ' + stopped.stopped);
      assert.ok(stopped.wall < 20, 'watchdog stopped the run after ' + stopped.wall + ' s');
      assert.deepEqual(stopped.survivors, []);
      assert.ok(stopped.lingerPid > 1, 'linger.pid: ' + stopped.lingerPid);
      assert.throws(() => process.kill(stopped.lingerPid, 0), {code:'ESRCH'}, 'the process the stopped test left is still alive');
      allPassed(record([['T', 'pass', 2], ['T/a', 'pass', 2]]), [['T', 'p'], ['T/a', 'p']], 10);
      allFailed(record([['T/a', 'fail', 3]]), [['T/a', 'p']], 20);
      suiteBounded(record([['T', 'pass', 29.9], ['U', 'fail', 1], ['V', 'skip', 0]]), [['T', 'p']], 30);
      console.log('shell wait seam rest observer accepted');
      return 0;
    }
    if (mode === 'bad') {
      const real = await runFast(process.cwd());
      const absent = await goTest(process.cwd(), ['-run', '^TestShellYieldLargeJSONAbsent$', './tools'], 10, true);
      const stopped = await lingering();
      const rejects = [
        () => allPassed(absent, [['TestShellYieldLargeJSONAbsent', 'kogen-loop/tools']], 10),
        () => allFailed(real, [fast], 20),
        () => failedByMutation({'unbounded envelope': real}, [['unbounded envelope', ...fast]], 20),
        () => failedByMutation({}, [['unbounded envelope', ...fast]], 20),
        () => suiteBounded(absent, [['TestShellYieldLargeJSONAbsent', 'kogen-loop/tools']], 30),
        () => allPassed(stopped, [['TestZZWatchdogControl', 'kogen-loop/tools']], 10),
        () => allFailed(stopped, [['TestZZWatchdogControl', 'kogen-loop/tools']], 20),
        () => suiteBounded(stopped, [], 30),
        () => allPassed(record([['T', null, 0]]), [['T', 'p']], 10),
        () => allPassed(record([]), [['T', 'p']], 10),
        () => allPassed(record([['T', 'fail', 2]]), [['T', 'p']], 10),
        () => allPassed(record([['T', 'skip', 0]]), [['T', 'p']], 10),
        () => allPassed(record([['T', 'pass', 2], ['T/a', 'pass', 11]]), [['T', 'p'], ['T/a', 'p']], 10),
        () => allPassed(record([['T', 'pass', 2]], '', {survivors:[4242]}), [['T', 'p']], 10),
        () => allFailed(record([]), [['T', 'p']], 20),
        () => allFailed(record([['T', 'pass', 2]]), [['T', 'p']], 20),
        () => allFailed(record([['T', 'fail', 21]]), [['T', 'p']], 20),
        () => allFailed(record([['T', 'fail', 3]], 'panic: test timed out after 100s'), [['T', 'p']], 20),
        () => allFailed(record([['T', 'fail', 3]], '', {stopped:'p U was still running after 20 s, so the run was stopped'}), [['T', 'p']], 20),
        () => allFailed(record([['T/a', 'fail', 3], ['T/b', 'pass', 3]]), [['T/a', 'p'], ['T/b', 'p']], 20),
        () => suiteBounded(record([['T', 'pass', 2], ['T/a', 'pass', 45.06]]), [['T', 'p']], 30),
        () => suiteBounded(record([['T', 'pass', 2], ['U', 'pass', 30]]), [['T', 'p']], 30),
        () => suiteBounded(record([['T', 'pass', 2]], 'panic: test timed out after 100s'), [['T', 'p']], 30),
        () => suiteBounded(record([['T', 'pass', 2]], 'FAIL\tkogen-loop/tools [build failed]'), [['T', 'p']], 30),
        () => suiteBounded(record([['T', 'pass', 2]], '', {error:'Error: spawn go ENOENT'}), [['T', 'p']], 30),
        () => suiteBounded(record([['T', 'fail', 2]]), [['T', 'p']], 30),
        () => suiteBounded(record([['U', 'pass', 2]]), [['T', 'p']], 30),
        () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-shell-wait-seam-rest-ctl-')); dirs.push(dir); fs.mkdirSync(path.join(dir, 'loop')); fs.writeFileSync(path.join(dir, 'loop', 'loop.go'), 'defer custody(rd.Tools.Session)()\ndefer custody(rd.Tools.Session)()\ndefer rd.Tools.EndShellRound()\n'); mutate(dir, 'no round cleanup'); },
      ];
      rejects.forEach((check, i) => assert.throws(check, assert.AssertionError, 'bad control ' + i + ' was accepted'));
      console.log('shell wait seam rest observer rejected');
      return 1;
    }
    return 2;
  } finally {
    for (const dir of dirs) fs.rmSync(dir, {recursive:true, force:true});
  }
}

if (require.main === module) {
  control(process.argv[2] === '--control' ? process.argv[3] : '').then(code => { process.exitCode = code; }, err => { console.error(err); process.exitCode = 3; });
} else {
  const {When, Then, After} = require('@cucumber/cucumber');
  After(function() { for (const dir of this.shellWaitRestDirs || []) fs.rmSync(dir, {recursive:true, force:true}); });
  When('I run each remaining shell-wait test on its own copy broken by its mutation, stopping any test that runs over {int} seconds:', {timeout:110000}, async function(limit, table) {
    this.shellWaitRestDirs = this.shellWaitRestDirs || [];
    this.shellWaitRestRuns = await brokenRuns(this.shellWaitRestDirs, table.raw(), limit);
  });
  When('I run the whole Go suite once, stopping any test that runs over {int} seconds', {timeout:110000}, async function(limit) {
    this.shellWaitRestRun = await goTest(process.cwd(), ['./...'], limit);
  });
  Then('each of these remaining shell-wait tests ran and passed within {int} seconds:', function(seconds, table) { allPassed(this.shellWaitRestRun, table.raw(), seconds); });
  Then('on each broken copy these remaining shell-wait tests failed within {int} seconds:', function(seconds, table) { failedByMutation(this.shellWaitRestRuns || {}, table.raw(), seconds); });
  Then('the whole Go suite ran these tests and none of its tests took {int} seconds or more:', function(seconds, table) { suiteBounded(this.shellWaitRestRun, table.raw(), seconds); });
}
