'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');

const P = 'l-sys-suite-gomaxprocs-2: ';

function go(args, env) {
  const r = spawnSync('go', args, {encoding: 'utf8', timeout: 95000, maxBuffer: 64 * 1024 * 1024, env: {...process.env, ...env}});
  return {status: r.status, signal: r.signal, error: r.error, out: (r.stdout || '') + (r.stderr || '')};
}

function tail(s, n = 6000) {
  return s.length > n ? '...' + s.slice(-n) : s;
}

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function outcome(r) {
  return `exit ${r.status}${r.signal ? ' signal ' + r.signal : ''}${r.error ? ' (' + r.error.message + ')' : ''}`;
}

// Top-level Go functions of the _test.go files in dir, by name.
function testFuncs(dir) {
  const defs = new Map();
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('_test.go')).sort()) {
    const file = path.join(dir, f);
    const src = fs.readFileSync(file, 'utf8');
    const re = /\nfunc ([A-Za-z_]\w*)\(/g;
    let m;
    while ((m = re.exec(src))) {
      const end = src.indexOf('\n}\n', m.index);
      assert.ok(end > m.index, `${file}: func ${m[1]} is not terminated`);
      if (!defs.has(m[1])) defs.set(m[1], {file, text: src.slice(m.index + 1, end + 2)});
    }
  }
  return defs;
}

// The function and every top-level function of the same test files that it calls, transitively.
function callGraph(dir, name) {
  const defs = testFuncs(dir);
  assert.ok(defs.has(name), `${dir}: func ${name} is missing`);
  const seen = new Set();
  const out = [];
  const queue = [name];
  while (queue.length) {
    const n = queue.shift();
    if (seen.has(n)) continue;
    seen.add(n);
    const d = defs.get(n);
    if (!d) continue;
    out.push({name: n, file: d.file, text: d.text});
    for (const m of d.text.matchAll(/(^|[^.\w])([A-Za-z_]\w*)\(/g)) {
      if (defs.has(m[2]) && !seen.has(m[2])) queue.push(m[2]);
    }
  }
  return out;
}

const timeWait = /\btime\.(Sleep|After|AfterFunc|NewTimer|NewTicker|Tick|Now|Since|Until)\b/;

function noTimeWaits(graph, what) {
  const bad = graph.filter(g => timeWait.test(g.text)).map(g => `${g.file}: func ${g.name} uses ${g.text.match(timeWait)[0]}`);
  assert.deepEqual(bad, [], `${what} still waits on wall-clock time:\n${bad.join('\n')}`);
}

When(P + 'I run {string} with GOMAXPROCS 2', {timeout: 100000}, function (command) {
  const words = command.split(' ').filter(Boolean);
  assert.equal(words[0], 'go', 'only go commands are run: ' + command);
  this.run = {command: 'GOMAXPROCS=2 ' + command, ...go(words.slice(1), {GOMAXPROCS: '2'})};
});

Then(P + 'the test {string} passed {int} time(s) in package {string}', function (name, n, pkg) {
  const r = this.run;
  assert.ok(r, 'no go command was run');
  const count = action => (r.out.match(new RegExp('^\\s*--- ' + action + ': ' + escape(name) + ' \\(', 'gm')) || []).length;
  const pass = count('PASS');
  const fail = count('FAIL');
  const skip = count('SKIP');
  const ok = new RegExp('^ok\\s+' + escape(pkg) + '\\s', 'm').test(r.out);
  const absent = pass + fail + skip === 0 ? ' (the test was absent or ran zero times)' : '';
  assert.ok(r.status === 0 && ok && pass === n && fail === 0 && skip === 0,
    `required test ${name} in ${pkg}: ${r.command}: ${outcome(r)}; passed ${pass}, failed ${fail}, skipped ${skip}, want ${n} passes${absent}\n${tail(r.out)}`);
});

Then(P + 'no sys test runs a shell fixture that busy-spins a CPU', function () {
  const spin = /\b(?:while|until)\s+(?::|true|false)\s*;?\s*do\s*(?::|true)?\s*;?\s*done\b/;
  const found = [];
  for (const f of fs.readdirSync('sys').filter(f => f.endsWith('_test.go')).sort()) {
    fs.readFileSync(path.join('sys', f), 'utf8').split('\n').forEach((line, i) => {
      if (spin.test(line)) found.push(`sys/${f}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(found, [], 'busy-spinning shell fixtures remain:\n' + found.join('\n'));
  const file = 'sys/timeout_custody_liveness_test.go';
  const defs = testFuncs('sys');
  for (const n of ['TestTimeoutCustodyBlockedObservation', 'TestTimeoutCustodyObservationError']) {
    assert.ok(defs.has(n) && defs.get(n).file === file, `${file}: func ${n} is missing`);
  }
  const custody = fs.readFileSync(file, 'utf8');
  for (const s of ['observer not entered', 'TERM grace was skipped', 'unresolved observation returned', 'published stopping result',
    'stop blocked by observation', 'blocked observation postponed SIGKILL', 'error published result', 'observation failure did not stop Run']) {
    assert.ok(custody.includes(s), `${file}: lost custody assertion "${s}"`);
  }
});

Then(P + 'the sys package vets for {string}', {timeout: 100000}, function (target) {
  const [GOOS, GOARCH] = target.split('/');
  const r = go(['vet', './sys'], {GOOS, GOARCH, CGO_ENABLED: '0'});
  assert.equal(r.status, 0, `GOOS=${GOOS} GOARCH=${GOARCH} CGO_ENABLED=0 go vet ./sys: ${outcome(r)}\n${tail(r.out)}`);
});

Then(P + 'TestLinuxTimeoutObservationChurn ends on {int} observed exits per worker and does not run in parallel', function (runs) {
  const file = 'sys/linux_timeout_observation_linux_test.go';
  const src = fs.readFileSync(file, 'utf8');
  assert.match(src, /^\/\/go:build linux$/m, `${file}: the linux build constraint is gone`);
  const defs = testFuncs('sys');
  for (const n of ['Churn', 'Zombie', 'Moved', 'Agreement']) {
    const name = 'TestLinuxTimeoutObservation' + n;
    assert.ok(defs.has(name) && defs.get(name).file === file, `${file}: func ${name} is missing`);
  }
  const graph = callGraph('sys', 'TestLinuxTimeoutObservationChurn');
  const all = graph.map(g => g.text).join('\n');
  assert.ok(!/\bt\.Parallel\(\)/.test(all), `${file}: TestLinuxTimeoutObservationChurn still runs in parallel with the other sys tests`);
  noTimeWaits(graph, 'TestLinuxTimeoutObservationChurn');
  assert.ok(!/\d+\s*\*\s*time\.Second/.test(all), `${file}: TestLinuxTimeoutObservationChurn still has a wall-clock window`);
  assert.ok(all.includes('"/bin/true"'), `${file}: TestLinuxTimeoutObservationChurn no longer churns /bin/true`);
  assert.ok(new RegExp('\\b' + runs + '\\b').test(all), `${file}: TestLinuxTimeoutObservationChurn does not run /bin/true a fixed ${runs} times per worker`);
  assert.match(all, /timeoutGroupAlive\(1 << 30\)/, `${file}: TestLinuxTimeoutObservationChurn no longer observes an absent group`);
  assert.match(all, /t\.Fatalf\("calls=%d errors=%d first=%v"/, `${file}: TestLinuxTimeoutObservationChurn no longer fails on observation errors`);
});

Then(P + 'TestRunKillGroupOnExit observes live group members with one ps listing and no sleep, poll or deadline', function () {
  const file = 'contract/sys_test.go';
  const graph = callGraph('contract', 'TestRunKillGroupOnExit');
  assert.equal(graph[0].file, file, `TestRunKillGroupOnExit moved out of ${file}`);
  const body = graph[0].text;
  for (const s of ['KillGroupOnExit: true', 'sys.Terminate(', '"started\\n"', 'without the option the background process should remain']) {
    assert.ok(body.includes(s), `${file}: TestRunKillGroupOnExit lost ${s}`);
  }
  const names = graph.map(g => g.name);
  assert.ok(!names.includes('waitGone'), `${file}: TestRunKillGroupOnExit still waits for reaping through waitGone`);
  noTimeWaits(graph, 'TestRunKillGroupOnExit');
  const live = graph.find(g => g.name === 'liveMembers');
  assert.ok(live && live.file === file, `${file}: TestRunKillGroupOnExit does not call liveMembers defined in ${file}`);
  assert.ok(live.text.includes('"ps"') && live.text.includes('pid=,pgid=,stat='), `${file}: liveMembers does not take one ps -A -o pid=,pgid=,stat= listing`);
  assert.match(live.text, /["'`][^"'`\n]*Z[^"'`\n]*["'`]/, `${file}: liveMembers does not exclude zombie rows`);
  const calls = (body.match(/\bliveMembers\(/g) || []).length;
  assert.ok(calls >= 2, `${file}: TestRunKillGroupOnExit checks live members ${calls} time(s); want after Run with KillGroupOnExit and after Terminate`);
});
