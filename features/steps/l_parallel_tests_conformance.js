'use strict';
// L-PARALLEL-TESTS-CONFORMANCE: run ./conformance uncached with go test -json and judge the report:
// every listed test ran and passed the required number of times, the listed tests paused for
// t.Parallel (or did not), and the top-level tests overlapped in time.
const assert = require('node:assert/strict');
const os = require('node:os');
const {spawnSync} = require('node:child_process');

const PKG = 'github.com/KogenAI/kogen-loop/conformance';
const END = ['pass', 'fail', 'skip'];

const list = text => text.split('\n').map(s => s.trim()).filter(Boolean);
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Go's t.TempDir paths are <temp root>/<test name><random>/<NNN>. A test name that carries one is
// compared with that path as the placeholder <TempDir>, so unchanged runs compare equal.
function tempRoots() {
  const roots = [process.env.TMPDIR, os.tmpdir(), '/tmp', '/private/tmp', '/var/folders', '/private/var/folders']
    .filter(Boolean).map(r => r.replace(/\/+$/, '')).filter(Boolean);
  return [...new Set(roots)].sort((a, b) => b.length - a.length);
}

function normalize(name, roots) {
  for (const r of roots) name = name.replace(new RegExp(escape(r) + '[^\\s]*?/\\d{3}(?=/|$)', 'g'), '<TempDir>');
  return name;
}

function describe(run) {
  const tail = ((run.stdout || '') + (run.stderr || '')).split('\n').filter(l => !l.startsWith('{')).slice(-40).join('\n');
  return `command: ${run.command}; exit ${run.status}${run.error ? '; spawn error ' + run.error : ''}\n${tail}`;
}

function events(run) {
  const out = [];
  for (const line of (run.stdout || '').split('\n')) {
    if (!line.startsWith('{')) continue;
    try {
      const e = JSON.parse(line);
      if (e.Package === PKG) out.push(e);
    } catch {
      // plain build output stays in describe()
    }
  }
  return out;
}

// Every expected name ended exactly `runs` times, all passes; no other test ran; the package passed.
function judgeRan(run, names, runs) {
  assert.ok(!run.error, describe(run));
  const roots = tempRoots();
  const counts = new Map();
  for (const e of events(run)) {
    if (!e.Test || !END.includes(e.Action)) continue;
    const name = normalize(e.Test, roots);
    const c = counts.get(name) || {pass: 0, fail: 0, skip: 0};
    c[e.Action]++;
    counts.set(name, c);
  }
  for (const name of names) {
    const c = counts.get(name) || {pass: 0, fail: 0, skip: 0};
    const outcome = c.pass + c.fail + c.skip === 0 ? 'absent (ran zero times)' : `passed ${c.pass}, failed ${c.fail}, skipped ${c.skip}`;
    assert.ok(c.pass === runs && c.fail === 0 && c.skip === 0,
      `required test ${name} must pass exactly ${runs} time(s) in ${PKG}: ${outcome}\n${describe(run)}`);
  }
  const expected = new Set(names);
  const extra = [...counts.keys()].filter(n => !expected.has(n));
  assert.deepEqual(extra, [], `tests outside the expected list ran in ${PKG} (names compared with TempDir paths as <TempDir>)\n${describe(run)}`);
  assert.equal(run.status, 0, `the go test run of ${PKG} did not exit 0\n${describe(run)}`);
  const pkg = events(run).filter(e => !e.Test && END.includes(e.Action)).map(e => e.Action);
  assert.deepEqual(pkg, ['pass'], `package ${PKG} outcome ${JSON.stringify(pkg)}\n${describe(run)}`);
}

function paused(run) {
  const roots = tempRoots();
  return new Set(events(run).filter(e => e.Test && e.Action === 'pause').map(e => normalize(e.Test, roots)));
}

// Top-level tests pause for t.Parallel unless they are in the serial list; each serial test ran.
function judgeTopLevel(run, serial) {
  const roots = tempRoots();
  const tops = [...new Set(events(run).filter(e => e.Test && !e.Test.includes('/') && END.includes(e.Action)).map(e => normalize(e.Test, roots)))].sort();
  const p = paused(run);
  for (const name of serial) {
    assert.ok(tops.includes(name), `required serial test ${name} did not run in ${PKG}\n${describe(run)}`);
  }
  for (const name of tops) {
    if (serial.includes(name)) {
      assert.ok(!p.has(name), `test ${name} must stay serial but paused for t.Parallel (${run.command})`);
    } else {
      assert.ok(p.has(name), `test ${name} ran but did not pause for t.Parallel (${run.command})`);
    }
  }
}

function judgeSubtests(run, names, wantPause) {
  const p = paused(run);
  for (const name of names) {
    assert.equal(p.has(name), wantPause,
      `subtest ${name} ${wantPause ? 'did not pause for t.Parallel' : 'paused for t.Parallel but must stay sequential'} (${run.command})`);
  }
}

// The summed active time of the top-level tests (from run or cont to their end) over the
// package's span. Disjoint serial runs can never exceed 1.
function overlap(run) {
  const evs = events(run).filter(e => e.Time);
  assert.ok(evs.length > 0, `no timed events from ${PKG}\n${describe(run)}`);
  const start = new Map();
  let active = 0;
  for (const e of evs) {
    if (!e.Test || e.Test.includes('/')) continue;
    if (e.Action === 'run' || e.Action === 'cont') start.set(e.Test, Date.parse(e.Time));
    if (END.includes(e.Action) && start.has(e.Test)) active += Date.parse(e.Time) - start.get(e.Test);
  }
  const end = evs.filter(e => !e.Test && END.includes(e.Action)).pop();
  assert.ok(end, `no package outcome from ${PKG}\n${describe(run)}`);
  const span = Date.parse(end.Time) - Date.parse(evs[0].Time);
  return {active: active / 1000, span: span / 1000, factor: span > 0 ? active / span : 0, elapsed: end.Elapsed};
}

function judgeOverlap(run, min) {
  const o = overlap(run);
  assert.ok(o.factor >= min,
    `top-level tests of ${PKG} were active ${o.active.toFixed(2)} s within a ${o.span.toFixed(2)} s package run: overlap ${o.factor.toFixed(3)}, want at least ${min} (${run.command})`);
  return o;
}

function goTest(args) {
  const started = Date.now();
  const r = spawnSync('go', args, {encoding: 'utf8', timeout: 840000, maxBuffer: 256 * 1024 * 1024});
  return {command: 'go ' + args.join(' '), status: r.status, error: r.error ? String(r.error) : '', stdout: r.stdout || '', stderr: r.stderr || '', wall: (Date.now() - started) / 1000};
}

// ---- observer controls: synthetic reports, small expectations ----

function synthetic(spec) {
  const t0 = Date.parse('2026-11-01T00:00:00Z');
  const ev = (s, Action, Test, extra) => JSON.stringify({Time: new Date(t0 + s * 1000).toISOString(), Action, Package: PKG, ...(Test ? {Test} : {}), ...extra});
  return {command: 'synthetic ' + spec.label, status: spec.status ?? 0, error: '', stderr: '', wall: 0, stdout: spec.lines(ev).join('\n') + '\n'};
}

const control = {
  names: ['TestA', 'TestA/one', 'TestB', 'TestB/<TempDir>', 'TestS', 'TestS/hook'],
  serial: ['TestS'], parallelSubs: ['TestA/one'], serialSubs: ['TestS/hook'], min: 1.5,
};

function goodLines(ev, o = {}) {
  const tmp = '/tmp/TestB' + (o.random || '1234567') + '/001';
  const seq = o.sequential;
  return [
    ev(0, 'start'),
    ev(0, 'run', 'TestS'), ev(0, 'run', 'TestS/hook'), ...(o.serialSubPaused ? [ev(0, 'pause', 'TestS/hook'), ev(0, 'cont', 'TestS/hook')] : []),
    ev(1, 'pass', 'TestS/hook', {Elapsed: 1}), ...(o.serialPaused ? [ev(1, 'pause', 'TestS'), ev(1, 'cont', 'TestS')] : []), ev(1, 'pass', 'TestS', {Elapsed: 1}),
    ev(1, 'run', 'TestA'), ev(1, 'pause', 'TestA'),
    ...(o.dropB ? [] : [ev(1, 'run', 'TestB'), ev(1, 'pause', 'TestB')]),
    ev(1, 'cont', 'TestA'), ev(1, 'run', 'TestA/one'), ...(o.subNotPaused ? [] : [ev(1, 'pause', 'TestA/one'), ev(1, 'cont', 'TestA/one')]),
    ev(3, 'pass', 'TestA/one', {Elapsed: 2}), ev(3, 'pass', 'TestA', {Elapsed: 2}),
    ...(o.dropB ? [] : [ev(seq ? 3 : 1, 'cont', 'TestB'), ev(seq ? 3 : 1, 'run', 'TestB/' + tmp), ev(seq ? 5 : 3, 'pass', 'TestB/' + tmp, {Elapsed: 2}), ev(seq ? 5 : 3, 'pass', 'TestB', {Elapsed: 2})]),
    ev(seq ? 5 : 3, o.status ? 'fail' : 'pass', undefined, {Elapsed: seq ? 5 : 3}),
  ];
}

function judgeAll(run, c) {
  judgeRan(run, c.names, 1);
  judgeTopLevel(run, c.serial);
  judgeSubtests(run, c.parallelSubs, true);
  judgeSubtests(run, c.serialSubs, false);
  judgeOverlap(run, c.min);
}

function runControl(kind) {
  if (kind === 'good') {
    try {
      judgeAll(synthetic({label: 'good', lines: ev => goodLines(ev, {random: '987654'})}), control);
      console.log('observer accepted');
    } catch (e) {
      console.log('observer rejected good report: ' + e.message.split('\n')[0]);
      process.exitCode = 1;
    }
    return;
  }
  const bad = [
    {label: 'missing test', o: {dropB: true}},
    {label: 'serial test paused', o: {serialPaused: true}},
    {label: 'required subtest not paused', o: {subNotPaused: true}},
    {label: 'serial subtest paused', o: {serialSubPaused: true}},
    {label: 'no overlap', o: {sequential: true}},
    {label: 'package failed', o: {status: 1}, status: 1},
  ];
  let rejected = 0;
  for (const b of bad) {
    try {
      judgeAll(synthetic({label: b.label, status: b.status, lines: ev => goodLines(ev, b.o)}), control);
      console.log('observer accepted bad report: ' + b.label);
    } catch {
      rejected++;
    }
  }
  if (rejected === bad.length) {
    console.log(`observer rejected ${rejected} of ${bad.length} bad reports`);
    process.exitCode = 1;
  }
}

if (require.main === module && process.argv[2] === '--control') {
  runControl(process.argv[3]);
} else {
  const {Given, When, Then} = require('@cucumber/cucumber');

  Given('the conformance test names are:', function (doc) {
    this.lptcNames = list(doc);
  });

  When('I run the conformance package once with the race detector and no test cache', {timeout: 900000}, function () {
    this.lptcRun = goTest(['test', '-race', '-json', '-count=1', '-timeout=600s', './conformance']);
  });

  When('I run the conformance package {int} times without the race detector and with no test cache', {timeout: 900000}, function (n) {
    this.lptcRun = goTest(['test', '-json', '-count=' + n, '-timeout=600s', './conformance']);
  });

  Then('the conformance run exits 0 and each listed conformance test passed exactly {int} time(s)', function (runs) {
    assert.ok(this.lptcRun, 'the conformance package was not run');
    assert.ok(this.lptcNames && this.lptcNames.length > 0, 'no conformance test names were given');
    judgeRan(this.lptcRun, this.lptcNames, runs);
  });

  Then('every top-level conformance test paused for t.Parallel except these serial tests:', function (doc) {
    judgeTopLevel(this.lptcRun, list(doc));
  });

  Then('these conformance subtests paused for t.Parallel:', function (doc) {
    judgeSubtests(this.lptcRun, list(doc), true);
  });

  Then('these conformance subtests did not pause for t.Parallel:', function (doc) {
    judgeSubtests(this.lptcRun, list(doc), false);
  });

  Then('the top-level conformance tests overlapped at least {float} times over the package run', function (min) {
    const o = judgeOverlap(this.lptcRun, min);
    this.log(`${this.lptcRun.command}: wall ${this.lptcRun.wall.toFixed(1)} s, package elapsed ${o.elapsed} s, top-level active ${o.active.toFixed(1)} s, overlap ${o.factor.toFixed(2)}`);
  });
}
