'use strict';
// Steps for L-SHELL-WAIT-SEAM: the shell wait's test seam (tools.Tools.ShellAfter), the speed
// of the five shell-wait tests, and that each of them still fails on a deliberately broken
// implementation. Broken implementations are built only in private copies of the tree.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

// Each mutation replaces anchors that must occur exactly once in the named file.
const MUTATIONS = {
  // The new-command wait is no longer 45 seconds (the pre-f2e30a4 one-second yield).
  'new-command wait': [['tools/tools.go', '45 * time.Second', 'time.Second']],
  // Retrieval no longer waits 30 seconds.
  'retrieval wait': [['tools/tools.go', '30 * time.Second', 'time.Second']],
  // The running envelope is no longer bounded.
  'unbounded envelope': [['tools/tools.go', 'if len(raw) > maxResult {', 'if false {']],
  // A retrieved completion reports exit status 0 whatever the command returned.
  'lost exit status': [['tools/tools.go', 'envelope["exit_status"] = res.Status', 'envelope["exit_status"] = 0']],
  // A discarded attempt no longer cancels its yielded handles.
  'kept handle': [['loop/overlap.go', 's.tl.CancelShellHandle(result.Handle)', '_ = result.Handle']],
  // A discarded attempt neither cancels its handles nor stops the groups it started.
  'kept attempt groups': [['loop/overlap.go', 's.tl.CancelShellHandle(result.Handle)', '_ = result.Handle'], ['loop/overlap.go', 'sys.Terminate(owned)', 'sys.Terminate(nil)']],
};
const HARNESS = path.join(__dirname, 'l_shell_wait_seam_test.go.txt');

function copyTree(from, to) {
  for (const entry of fs.readdirSync(from, {withFileTypes:true})) {
    if (entry.name === '.git') continue;
    const a = path.join(from, entry.name), b = path.join(to, entry.name);
    if (entry.isDirectory()) { fs.mkdirSync(b); copyTree(a, b); }
    else if (entry.isFile()) fs.copyFileSync(a, b);
  }
}
function privateCopy(dirs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-shell-wait-seam-'));
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
// goTest runs go test -json and keeps every test's final action and elapsed time.
function goTest(cwd, args, timeout, quiet) {
  const argv = ['test', '-count=1', '-json', ...args];
  const started = Date.now();
  const r = spawnSync('go', argv, {cwd, encoding:'utf8', timeout, maxBuffer:64 << 20});
  const run = {command:'go ' + argv.join(' '), cwd, status:r.status, error:r.error ? String(r.error) : '', wall:(Date.now() - started) / 1000, tests:{}, ran:{}, output:{}, raw:r.stdout + r.stderr};
  for (const line of (r.stdout || '').split('\n')) {
    if (!line.startsWith('{')) continue;
    let e; try { e = JSON.parse(line); } catch (_) { continue; }
    if (!e.Test) continue;
    const key = e.Package + ' ' + e.Test;
    if (e.Action === 'run') run.ran[key] = true;
    if (e.Action === 'output') run.output[key] = (run.output[key] || '') + e.Output;
    if (['pass', 'fail', 'skip'].includes(e.Action)) run.tests[key] = {action:e.Action, elapsed:e.Elapsed};
  }
  if (!quiet) console.log(run.command + ' in ' + cwd + ': ' + run.wall.toFixed(1) + ' s wall, ' + JSON.stringify(run.tests));
  return run;
}
function outcome(run, test, pkg) {
  const got = run.tests[pkg + ' ' + test];
  const tail = run.raw.length > 4000 ? run.raw.slice(-4000) : run.raw;
  const where = 'test ' + test + ' in package ' + pkg + ' (command: ' + run.command + ' in ' + run.cwd + '; exit ' + run.status + (run.error ? ', ' + run.error : '') + ')';
  return {got, where, tail};
}
function passed(run, test, pkg, seconds) {
  const {got, where, tail} = outcome(run, test, pkg);
  assert.ok(got, where + ' did not run (absent or zero runs):\n' + tail);
  assert.equal(got.action, 'pass', where + ' outcome ' + got.action + ':\n' + (run.output[pkg + ' ' + test] || tail));
  assert.ok(got.elapsed <= seconds, where + ' passed but took ' + got.elapsed + ' s, more than ' + seconds + ' s');
}
function failed(run, test, pkg, seconds) {
  const {got, where, tail} = outcome(run, test, pkg);
  assert.ok(got, where + ' did not run on the broken implementation (absent, build failure or zero runs):\n' + tail);
  const out = run.output[pkg + ' ' + test] || '';
  assert.equal(got.action, 'fail', where + ' outcome ' + got.action + ' on the broken implementation; it must fail:\n' + out);
  assert.ok(!/panic: test timed out/.test(run.raw), where + ' only failed by the go test timeout:\n' + tail);
  assert.ok(got.elapsed <= seconds, where + ' failed after ' + got.elapsed + ' s, more than ' + seconds + ' s');
}
// allPassed checks every listed test at once, so one slow or failing test does not hide the
// others: each must have run, passed and taken at most the given seconds.
function allPassed(run, rows, seconds) {
  const lines = [], bad = [];
  for (const [test, pkg] of rows) {
    const key = pkg + ' ' + test, got = run.tests[key];
    let line = test + ' in package ' + pkg + ': ';
    if (!run.ran[key]) line += 'did not run (absent or zero runs)';
    else if (!got) line += 'ran (=== RUN ' + test + ') but reported no result: still running when the go test -timeout stopped the package';
    else line += 'ran, outcome ' + got.action + ' after ' + got.elapsed + ' s';
    const result = (run.output[key] || '').split('\n').filter(l => /^\s*--- (PASS|FAIL|SKIP): /.test(l)).map(l => l.trim()).join('; ');
    if (result) line += ' (' + result + ')';
    const ok = got && got.action === 'pass' && got.elapsed <= seconds;
    if (!ok) bad.push(line + '\n' + (run.output[key] || '').split('\ngoroutine ')[0].trimEnd());
    lines.push((ok ? 'ok   ' : 'FAIL ') + line);
  }
  const running = /panic: test timed out[\s\S]*?running tests:[\s\S]*?(?=\n\n|$)/.exec(run.raw);
  assert.equal(bad.length, 0, 'command: ' + run.command + ' in ' + run.cwd + ' (exit ' + run.status + (run.error ? ', ' + run.error : '') + '); each test must pass within ' + seconds + ' s:\n' + lines.join('\n') + '\n\n' + bad.join('\n\n') + (running ? '\n\n' + running[0] : ''));
}

if (require.main === module) {
  // Shaping controls for the observer: node l_shell_wait_seam.js --control good|bad, run from
  // the unchanged base tree. Good: a minimal known-good seam passes the harness, every mutation
  // anchor is present exactly once, and passed/failed accept matching records. Bad: an ignored
  // seam and a wrong wait fail the harness, and passed/failed/mutate reject wrong records.
  const SEAM = [
    ['tools/tools.go', '\tDocumentation Documentation\n', '\tDocumentation Documentation\n\tShellAfter    func(wait time.Duration) <-chan time.Time\n'],
    ['tools/tools.go', '\ttimer := time.NewTimer(wait)\n\tdefer timer.Stop()\n', '\tvar elapsed <-chan time.Time\n\tif t.ShellAfter != nil {\n\t\telapsed = t.ShellAfter(wait)\n\t} else {\n\t\ttimer := time.NewTimer(wait)\n\t\tdefer timer.Stop()\n\t\telapsed = timer.C\n\t}\n'],
    ['tools/tools.go', '\tcase <-timer.C:\n', '\tcase <-elapsed:\n'],
  ];
  const IGNORED = [['tools/tools.go', '\tDocumentation Documentation\n', '\tDocumentation Documentation\n\tShellAfter    func(wait time.Duration) <-chan time.Time\n']];
  const dirs = [];
  const harness = (edits, mutation) => {
    const dir = privateCopy(dirs);
    MUTATIONS[' control'] = edits; mutate(dir, ' control'); delete MUTATIONS[' control'];
    if (mutation) mutate(dir, mutation);
    fs.copyFileSync(HARNESS, path.join(dir, 'tools', 'zz_l_shell_wait_seam_accept_test.go'));
    return goTest(dir, ['-timeout', '90s', '-run', '^TestAcceptShellWaitSeam$', './tools'], 110000, true);
  };
  // rejected requires the harness itself to have run and failed for the named reason.
  const rejected = (run, reason) => {
    const out = run.output['github.com/KogenAI/kogen-loop/tools TestAcceptShellWaitSeam'] || '';
    if (!run.tests['github.com/KogenAI/kogen-loop/tools TestAcceptShellWaitSeam'] || !out.includes(reason)) throw new Error('harness did not fail with ' + JSON.stringify(reason) + ':\n' + run.raw.slice(-4000));
    passed(run, 'TestAcceptShellWaitSeam', 'github.com/KogenAI/kogen-loop/tools', 20);
  };
  const record = (action, elapsed, raw = '', ran = !!action) => ({command:'go test (control)', cwd:'control', status:action === 'pass' ? 0 : 1, error:'', tests:action ? {'p T':{action, elapsed}} : {}, ran:ran ? {'p T':true} : {}, output:{}, raw});
  try {
    if (process.argv[2] === '--control' && process.argv[3] === 'good') {
      passed(harness(SEAM), 'TestAcceptShellWaitSeam', 'github.com/KogenAI/kogen-loop/tools', 20);
      for (const name of Object.keys(MUTATIONS)) { const dir = privateCopy(dirs); mutate(dir, name); }
      passed(record('pass', 2), 'T', 'p', 10);
      failed(record('fail', 3), 'T', 'p', 30);
      allPassed(record('pass', 2), [['T', 'p']], 10);
      console.log('shell wait seam observer accepted');
    } else if (process.argv[2] === '--control' && process.argv[3] === 'bad') {
      const rejects = [
        () => rejected(harness(IGNORED), 'the shell wait never asked ShellAfter for its 45s wait'),
        () => rejected(harness(SEAM, 'new-command wait'), 'the shell wait asked ShellAfter for 1s, want 45s'),
        () => rejected(harness(SEAM, 'retrieval wait'), 'the shell wait asked ShellAfter for 1s, want 30s'),
        () => passed(record(null), 'T', 'p', 10),
        () => passed(record('fail', 2), 'T', 'p', 10),
        () => passed(record('skip', 0), 'T', 'p', 10),
        () => passed(record('pass', 46), 'T', 'p', 10),
        () => failed(record(null), 'T', 'p', 30),
        () => failed(record('pass', 2), 'T', 'p', 30),
        () => failed(record('fail', 31), 'T', 'p', 30),
        () => failed(record('fail', 3, 'panic: test timed out after 60s'), 'T', 'p', 30),
        () => allPassed(record(null), [['T', 'p']], 10),
        () => allPassed(record(null, 0, 'panic: test timed out after 30s', true), [['T', 'p']], 10),
        () => allPassed(record('fail', 2), [['T', 'p']], 10),
        () => allPassed(record('pass', 11), [['T', 'p']], 10),
        () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-shell-wait-seam-ctl-')); dirs.push(dir); fs.mkdirSync(path.join(dir, 'tools')); fs.writeFileSync(path.join(dir, 'tools', 'tools.go'), '45 * time.Second 45 * time.Second'); mutate(dir, 'new-command wait'); },
      ];
      rejects.forEach((check, i) => assert.throws(check, assert.AssertionError, 'bad control ' + i + ' was accepted'));
      console.log('shell wait seam observer rejected');
      process.exitCode = 1;
    }
  } finally {
    for (const dir of dirs) fs.rmSync(dir, {recursive:true, force:true});
  }
} else {
  const {Given, When, Then, After} = require('@cucumber/cucumber');
  After(function() { for (const dir of this.shellWaitSeamDirs || []) fs.rmSync(dir, {recursive:true, force:true}); });
  Given('the Go API has the shell wait seam {string}', function(symbol) {
    const r = spawnSync('go', ['doc', './tools', symbol], {encoding:'utf8', timeout:60000});
    assert.equal(r.status, 0, 'go doc ./tools ' + symbol + ': exit ' + r.status + '\n' + r.stdout + r.stderr + (r.error || ''));
  });
  When('I run the shell wait seam harness', {timeout:115000}, function() {
    this.shellWaitSeamDirs = this.shellWaitSeamDirs || [];
    const dir = privateCopy(this.shellWaitSeamDirs);
    fs.copyFileSync(HARNESS, path.join(dir, 'tools', 'zz_l_shell_wait_seam_accept_test.go'));
    this.shellWaitSeamRun = goTest(dir, ['-timeout', '90s', '-run', '^TestAcceptShellWaitSeam$', './tools'], 110000);
  });
  // The go test timeout lets the unchanged tests complete (about 77 s) so their result is reported.
  When('I run the Go tests {string} in packages {string}', {timeout:115000}, function(pattern, pkgs) {
    this.shellWaitSeamRun = goTest(process.cwd(), ['-timeout', '100s', '-run', pattern, ...pkgs.split(' ')], 110000);
  });
  When('I run the Go test {string} in {string} on a copy with the mutation {string}', {timeout:115000}, function(test, pkgDir, name) {
    this.shellWaitSeamDirs = this.shellWaitSeamDirs || [];
    const dir = privateCopy(this.shellWaitSeamDirs);
    mutate(dir, name);
    this.shellWaitSeamRun = goTest(dir, ['-timeout', '60s', '-run', '^' + test + '$', pkgDir], 110000);
  });
  Then('the Go test {string} in package {string} passed within {int} seconds', function(test, pkg, seconds) { passed(this.shellWaitSeamRun, test, pkg, seconds); });
  Then('each of these Go tests ran and passed within {int} seconds:', function(seconds, table) { allPassed(this.shellWaitSeamRun, table.raw(), seconds); });
  Then('the Go test {string} in package {string} failed within {int} seconds without timing out', function(test, pkg, seconds) { failed(this.shellWaitSeamRun, test, pkg, seconds); });
}
