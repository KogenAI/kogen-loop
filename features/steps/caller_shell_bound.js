'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {spawnSync} = require('node:child_process');
const hash = b => createHash('sha256').update(b).digest('hex');
let workspace;
function world() {
  if (!workspace) {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'caller-shell-bound-'));
    fs.chmodSync(workspace, 0o700);
    for (const n of ['home', 'tmp', 'cache', 'gopath']) fs.mkdirSync(path.join(workspace, n), {mode: 0o700});
    fs.writeFileSync(path.join(workspace, 'overlay.json'), JSON.stringify({Replace: {
      [path.resolve('conformance/caller_shell_bound_acceptance_test.go')]: path.resolve('features/steps/caller_shell_bound_test.go.txt')
    }}), {mode: 0o600});
  }
  return workspace;
}
function execute(c, mask = '077') {
  assert.ok(['077', '022'].includes(mask));
  const d = world();
  const golden = c.case === 'golden';
  const names = golden ? c.tests : ['TestCallerShellBoundAcceptance'];
  const pkg = golden ? 'tools' : 'conformance';
  const args = ['test', '-json', '-count=1', '-timeout=60s'];
  if (!golden) args.push('-overlay', path.join(d, 'overlay.json'));
  args.push('./' + pkg, '-run', '^(' + names.join('|') + ')$');
  const r = spawnSync('/bin/sh', ['-c', 'umask "$1"; shift; exec go "$@"', 'caller-shell-bound', mask, ...args], {
    env: {LC_ALL: 'en_US.UTF-8', PATH: process.env.PATH, HOME: path.join(d, 'home'), TMPDIR: path.join(d, 'tmp'),
      GOCACHE: path.join(d, 'cache'), GOPATH: path.join(d, 'gopath'), GOENV: 'off', GOTOOLCHAIN: 'local', GOPROXY: 'off', GOSUMDB: 'off', CS_BOUND_CASE: JSON.stringify(c)},
    encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024
  });
  return {status: r.status, signal: r.signal, error: r.error ? r.error.message : null, stdout: r.stdout || '', stderr: r.stderr || '', pkg: 'kogen-loop/' + pkg, names};
}
function verifyReport(r) {
  assert.equal(r.error, null, 'process.error');
  assert.equal(r.signal, null, 'process.signal');
  assert.equal(r.status, 0, 'process.status\n' + r.stdout + r.stderr);
  assert.equal(r.stderr, '', 'process.stderr');
  const events = r.stdout.trim().split('\n').map(s => JSON.parse(s));
  assert.ok(events.length > 0, 'report.empty');
  assert.ok(events.every(e => e.Package === r.pkg), 'report.package');
  assert.ok(!events.some(e => e.Action === 'skip' || e.Action === 'fail'), 'report.fail-or-skip');
  const count = (a, t) => events.filter(e => e.Action === a && e.Test === t).length;
  assert.equal(count('start', undefined), 1, 'report.start');
  assert.equal(count('pass', undefined), 1, 'report.pass');
  for (const name of r.names) {
    assert.equal(count('run', name), 1, 'report.run.' + name);
    assert.equal(count('pass', name), 1, 'report.pass.' + name);
  }
  for (const e of events.filter(e => e.Action === 'run')) {
    assert.equal(count('run', e.Test), 1, 'report.duplicate.' + e.Test);
    assert.equal(count('pass', e.Test), 1, 'report.uncompleted.' + e.Test);
  }
  return events;
}
function payload(r) {
  const lines = verifyReport(r).filter(e => e.Action === 'output' && e.Test === 'TestCallerShellBoundAcceptance')
    .map(e => String(e.Output)).join('').split('\n').filter(s => s.startsWith('CSOBS '));
  assert.equal(lines.length, 1, 'payload.count');
  return JSON.parse(lines[0].slice(6));
}
function equalPayload(actual, expected, label = '$') {
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), label);
    assert.equal(actual.length, expected.length, label + '.length');
    expected.forEach((v, i) => equalPayload(actual[i], v, label + '[' + i + ']'));
  } else if (expected !== null && typeof expected === 'object') {
    assert.ok(actual !== null && typeof actual === 'object' && !Array.isArray(actual), label);
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), label + '.keys');
    for (const k of Object.keys(expected)) equalPayload(actual[k], expected[k], label + '.' + k);
  } else assert.deepEqual(actual, expected, label);
}
function preservationDigest(root = '.') {
  const skip = p => p === '.git' || p === '.kogen/local' || p === 'bin' || p === 'kogen-loop' || p.endsWith('.DS_Store') ||
    p.startsWith('.kogen/intents/caller-shell-bound') || p.startsWith('features/steps/caller_shell_bound') ||
    ['tools/tools.go', 'tools/defs.go', 'sys/sys.go', 'docs/contract/loop-v1.md', 'README.md'].includes(p) ||
    /^(tools|sys|conformance)\/caller_shell_bound_[^/]+_test\.go$/.test(p) || p.startsWith('conformance/caller-shell-bound-testdata');
  const rows = [];
  function walk(dir) {
    for (const e of fs.readdirSync(path.join(root, dir), {withFileTypes: true})) {
      const p = path.posix.join(dir, e.name);
      if (skip(p)) continue;
      if (e.isDirectory()) walk(p);
      else { assert.ok(e.isFile(), 'scope.nonregular.' + p); rows.push([p, hash(fs.readFileSync(path.join(root, p)))]); }
    }
  }
  walk('');
  rows.sort((a, b) => a[0].localeCompare(b[0], 'en'));
  return hash(JSON.stringify(rows));
}
function cleanup() { if (workspace) fs.rmSync(workspace, {recursive: true, force: true}); }
function control(kind) {
  assert.ok(['good', 'bad'].includes(kind));
  // Real reference fixtures, independent of the not-yet-added Tools option:
  // sys timeout + explicit joined custody, versus a snapshot of still-live owned actors.
  const expected = {ready: true, sameGroup: true, leaderGone: true, childGone: true, grandchildGone: true};
  const real = payload(execute({case: kind === 'good' ? 'fixture' : 'fixture-live', bound: '1s', mode: 'leader-exits'}));
  if (kind === 'good') equalPayload(real, expected);
  else {
    let caught;
    try { equalPayload(real, expected); } catch (e) { caught = e; }
    assert.ok(caught && /\$\.(leaderGone|childGone|grandchildGone)/.test(caught.message), 'live fixture must fail custody assertion');
  }
  const want = {text: 'timed out after 1s\nexit status: 137\npartial\n', error: '', childGone: true, grandchildGone: true,
    leaderGone: true, sameGroup: true, goneAtPublish: true, published: 1, requests: 2, ending: 'terminal',
    nextOutputs: [{type: 'function_call_output', call_id: 'c1', output: 'timed out after 1s\nexit status: 137\npartial\n'}],
    definitionsStable: true};
  const event = (Action, Test, Output) => ({Package: 'kogen-loop/conformance', Action, ...(Test ? {Test} : {}), ...(Output ? {Output} : {})});
  const name = 'TestCallerShellBoundAcceptance';
  const frames = [event('start'), event('run', name), event('output', name, 'CSOBS ' + JSON.stringify(want) + '\n'), event('pass', name), event('pass')];
  const report = ev => ({status: 0, signal: null, error: null, stderr: '', stdout: ev.map(e => JSON.stringify(e)).join('\n') + '\n', pkg: 'kogen-loop/conformance', names: [name]});
  // ASCII makes this an exact byte-boundary reproducer of test2json's split:
  // the first 1024-byte frame ends inside a JSON string, with no newline.
  const longWant = {commandOnly: true, description: 'x'.repeat(1300), zeroBytesEqual: true};
  const longLine = 'CSOBS ' + JSON.stringify(longWant) + '\n';
  assert.ok(Buffer.byteLength(longLine) > 1024);
  const splitOutputs = [event('output', name, longLine.slice(0, 1024)), event('output', name, longLine.slice(1024))];
  const splitFrames = [...frames.slice(0, 2), ...splitOutputs, ...frames.slice(3)];
  if (kind === 'good') {
    equalPayload(payload(report(frames)), want);
    equalPayload(payload(report(splitFrames)), longWant);
    // The filesystem reader must actually consume changed bytes, not just paths.
    const d = path.join(world(), 'scope'); fs.mkdirSync(d, {mode: 0o700});
    fs.writeFileSync(path.join(d, 'kept'), 'old'); const old = preservationDigest(d);
    fs.writeFileSync(path.join(d, 'kept'), 'changed'); assert.notEqual(preservationDigest(d), old);
    process.stdout.write('caller-shell-bound observer good\n'); return;
  }
  // Each negative starts from its own known-good frame/payload; no earlier positive
  // assertion can mask the deeper replay/custody/cancellation checks.
  const reject = (fn, message) => {
    let e; try { fn(); } catch (err) { e = err; }
    assert.ok(e && (!message || e.message.includes(message)), 'negative control missed intended assertion: ' + message);
  };
  assert.throws(() => payload(report(splitFrames.filter((_, i) => i !== 3))), SyntaxError, 'missing continuation must fail JSON parsing');
  reject(() => payload(report([...frames.slice(0, 2), ...splitOutputs, ...splitOutputs, ...frames.slice(3)])), 'payload.count');
  function leaves(v, keys = []) {
    if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => leaves(x, [...keys, k]));
    return [{keys, value: v}];
  }
  const extra = {outputs: ['exit status: 0\nok', 'exit status: 0\nok'], aggregateExceedsBound: true, providerWaitExceedsBound: true,
    defaultBytesEqual: true, zeroBytesEqual: true, otherToolsUnchanged: true, commandOnly: true, stable: true, previousUnchanged: true,
    description: 'caller 1s', secondDescription: 'caller 2s', laterEffect: false, returnedInput: false, replayBytesEqual: true};
  for (const good of [want, extra, {error: 'context.Canceled', text: '', published: 0, requests: 1, ending: '', nextOutputs: [], laterEffect: false}]) {
    for (const {keys, value} of leaves(good)) {
      const bad = structuredClone(good); let p = bad;
      for (const k of keys.slice(0, -1)) p = p[k];
      p[keys.at(-1)] = typeof value === 'boolean' ? !value : typeof value === 'number' ? value + 1 : value + '!';
      reject(() => equalPayload(bad, good), '$');
    }
    reject(() => equalPayload({...good, extra: true}, good), '$.keys');
  }
  for (const index of [0, 1, 2, 3, 4]) reject(() => payload(report(frames.filter((_, i) => i !== index))));
  for (const action of ['fail', 'skip']) reject(() => payload(report([...frames, event(action, name)])), 'report.fail-or-skip');
  for (const mutate of [r => r.status = 1, r => r.signal = 'SIGKILL', r => r.error = 'timeout', r => r.stderr = 'compiler diagnostic\n',
    r => r.stdout = 'compiler diagnostic\n', r => r.pkg = 'wrong', r => r.stdout += JSON.stringify(event('run', 'TestUnfinished')) + '\n',
    r => r.stdout += JSON.stringify(frames[2]) + '\n']) {
    const r = report(frames); mutate(r); reject(() => payload(r));
  }
  const d = path.join(world(), 'scope-bad'); fs.mkdirSync(d, {mode: 0o700});
  fs.writeFileSync(path.join(d, 'kept'), 'old'); const digest = preservationDigest(d);
  fs.writeFileSync(path.join(d, 'kept'), 'changed'); reject(() => assert.equal(preservationDigest(d), digest));
  process.stdout.write('caller-shell-bound observer bad rejected\n'); process.exitCode = 1;
}
if (require.main === module) {
  try {
    if (process.argv[2] === '--control') control(process.argv[3]);
    else {
      assert.equal(process.argv[2], '--fixture');
      equalPayload(payload(execute({case: 'fixture', bound: '1s', mode: 'leader-exits'})),
        {ready: true, sameGroup: true, leaderGone: true, childGone: true, grandchildGone: true});
      process.stdout.write('caller-shell-bound fixture supported\n');
    }
  } catch (e) { console.error(e.stack); process.exitCode = 2; }
  finally { cleanup(); }
} else {
  const {Given, When, Then, AfterAll} = require('@cucumber/cucumber');
  Given('the caller-shell-bound coverage is:', function(text) { this.csWant = JSON.parse(text); });
  When('I exercise caller-shell-bound with umask {string}', {timeout: 150000}, function(mask) { this.csReport = execute(this.csWant, mask); });
  Then('caller-shell-bound reports exactly the required passing coverage', function() {
    if (this.csWant.case === 'golden') verifyReport(this.csReport);
    else equalPayload(payload(this.csReport), this.csWant.expected);
  });
  Then('the caller-shell-bound preservation digest is {string}', function(want) { assert.equal(preservationDigest(), want, 'scope.baseline'); });
  AfterAll(cleanup);
}
