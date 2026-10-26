'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {spawnSync} = require('node:child_process');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// Frozen local bytes at bbf3fdd6. No Git history is needed in verification copies.
const BASELINE = {
  files: [
    '.gitignore',
    '.kogen/intents/standalone-loop/acceptance.feature',
    '.kogen/intents/standalone-loop/intent.md',
    '.kogen/intents/standalone-loop/model.qnt',
    '.kogen/project.yaml',
    'LICENSE',
    'NOTICE',
    'README.md',
    'api/api.go',
    'api/task_regression_test.go',
    'cmd/kogen-loop/main.go',
    'conformance/cancellation_regression_test.go',
    'conformance/harness_test.go',
    'conformance/library_test.go',
    'conformance/process_test.go',
    'conformance/task_regression_test.go',
    'conformance/testdata/multi_call_terminal_in_middle.json',
    'conformance/testdata/no_call.json',
    'conformance/testdata/terminal.json',
    'conformance/testdata/tool_result_cut.json',
    'conformance/testdata/usage_partial.json',
    'conformance/testdata/usage_unknown.json',
    'docs/contract/loop-v1.md',
    'docs/provenance/extraction.md',
    'docs/provenance/loop-reference-manifest.json',
    'docs/provenance/reference-README.md',
    'features/steps/README.md',
    'features/steps/loop_driver.go',
    'features/steps/standalone_loop.js',
    'go.mod',
    'loop/loop.go',
    'loop/session.go',
    'loop/usage.go',
    'provider/affinity_test.go',
    'provider/auth_test.go',
    'provider/cache.go',
    'provider/cache_test.go',
    'provider/caching_test.go',
    'provider/chat.go',
    'provider/chat_test.go',
    'provider/client.go',
    'provider/compatible_test.go',
    'provider/creds.go',
    'provider/creds_test.go',
    'provider/diagnostics_test.go',
    'provider/errors.go',
    'provider/helpers_test.go',
    'provider/inspect.go',
    'provider/jsonenc.go',
    'provider/keyfake_test.go',
    'provider/keys.go',
    'provider/keys_test.go',
    'provider/lock.go',
    'provider/lock_test.go',
    'provider/login.go',
    'provider/login_test.go',
    'provider/messages.go',
    'provider/messages_test.go',
    'provider/profiles.go',
    'provider/profiles.json',
    'provider/profiles_test.go',
    'provider/provider.go',
    'provider/respond.go',
    'provider/respond_test.go',
    'provider/stream.go',
    'provider/testdata/elixir_prompt_cache.json',
    'provider/token.go',
    'provider/transient_test.go',
    'provider/usage.go',
    'provider/wait_test.go',
    'provider/wire.go',
    'sys/error.go',
    'sys/sys.go',
    'sys/sys_test.go',
    'tools/conversation.go',
    'tools/conversation_test.go',
    'tools/cut_output_test.go',
    'tools/cut_test.go',
    'tools/defs.go',
    'tools/defs_test.go',
    'tools/documentation.go',
    'tools/documentation_test.go',
    'tools/git.go',
    'tools/git_test.go',
    'tools/helper_test.go',
    'tools/image.go',
    'tools/image_test.go',
    'tools/json.go',
    'tools/json_test.go',
    'tools/testdata/cut_golden.json',
    'tools/testdata/defs_golden.json',
    'tools/testdata/tools_golden.json',
    'tools/tools.go',
    'tools/tools_extra_test.go',
    'tools/tools_test.go'
  ],
  digest: 'b5c07e81d01c5f0cdc8367a2fae738c3eba992a237281b93c5c7764e4f5cd0fc',
  status: 'This tree adopts an external reference into a fresh native Build. External extraction history is not native authorship, approval or verification. No current Kogen consumer, synchronized copy or digest pin is claimed here. No public release, global install, remote push or Kogen synchronization is part of this delivery.'
};
let workspace;

function privateDir(p) {
  fs.mkdirSync(p, {recursive: true, mode: 0o700});
  fs.chmodSync(p, 0o700);
  return p;
}

function world() {
  if (!workspace) {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-stream-acceptance-'));
    fs.chmodSync(workspace, 0o700);
    for (const name of ['home', 'tmp', 'gocache', 'gopath']) privateDir(path.join(workspace, name));
  }
  return workspace;
}

function runTests(want, mask) {
  assert.match(want.package, /^kogen-loop\/(provider|conformance)$/);
  assert.match(want.suite, /^TestProviderStream[A-Za-z]+$/);
  assert.ok(['077', '022'].includes(mask));
  const dir = world();
  const env = {
    PATH: process.env.PATH,
    HOME: path.join(dir, 'home'), TMPDIR: path.join(dir, 'tmp'),
    GOCACHE: path.join(dir, 'gocache'), GOPATH: path.join(dir, 'gopath'),
    GOENV: 'off', GOTOOLCHAIN: 'local', GOPROXY: 'off', GOSUMDB: 'off'
  };
  const p = spawnSync('/bin/sh', ['-c', 'umask "$1"; shift; exec go "$@"', 'provider-stream', mask,
    'test', '-json', '-count=1', '-timeout=90s', './' + want.package.split('/')[1], '-run', '^' + want.suite + '$'],
  {env, encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024});
  return {status: p.status, signal: p.signal, error: p.error ? p.error.message : null, stdout: p.stdout || '', stderr: p.stderr || ''};
}

function verifyReport(observed, want) {
  assert.equal(observed.error, null, observed.error || 'subprocess error');
  assert.equal(observed.signal, null, 'test process did not exit normally');
  assert.equal(observed.status, 0, observed.stdout + observed.stderr);
  assert.equal(observed.stderr, '', 'unexpected process diagnostics');
  const lines = observed.stdout.trim().split('\n');
  const events = lines.map(line => JSON.parse(line));
  assert.ok(events.length > 0, 'empty go test report');
  assert.ok(events.every(e => e.Package === want.package), 'wrong package in report');
  assert.ok(!events.some(e => ['fail', 'skip'].includes(e.Action)), 'a test failed or skipped');
  const count = (action, test) => events.filter(e => e.Action === action && e.Test === test).length;
  assert.equal(count('start', undefined), 1, 'package must start exactly once');
  assert.equal(count('pass', undefined), 1, 'package must pass exactly once');
  const required = [want.suite, ...want.tests];
  assert.equal(new Set(required).size, required.length, 'duplicate required test');
  for (const name of required) {
    assert.equal(count('run', name), 1, `missing or repeated execution: ${name}`);
    assert.equal(count('pass', name), 1, `missing or repeated pass: ${name}`);
  }
  for (const e of events.filter(e => e.Action === 'run')) {
    assert.equal(count('run', e.Test), 1, `repeated execution: ${e.Test}`);
    assert.equal(count('pass', e.Test), 1, `uncompleted test: ${e.Test}`);
  }
}

function inspectScope(root = '.') {
  const hashes = {};
  function walk(dir) {
    for (const entry of fs.readdirSync(path.join(root, dir), {withFileTypes: true})) {
      const p = path.posix.join(dir, entry.name);
      // Exactly the current .gitignore exclusions, plus Git administrative data.
      if (p === '.git' || p === '.kogen/local' || p === 'bin' || p === 'kogen-loop' || entry.name === '.DS_Store') continue;
      if (entry.isDirectory()) walk(p);
      else {
        assert.ok(entry.isFile(), 'non-regular scope input: ' + p);
        hashes[p] = hash(fs.readFileSync(path.join(root, p)));
      }
    }
  }
  walk('');
  return {hashes, current: fs.readFileSync(path.join(root, 'README.md'), 'utf8')};
}

function verifyScope(o, status, baseline = BASELINE) {
  const oldFiles = new Set(baseline.files);
  for (const p of baseline.files) assert.ok(Object.hasOwn(o.hashes, p), 'missing baseline file: ' + p);
  const allowed = p => p.startsWith('.kogen/intents/provider-stream-conformance/') ||
    p === 'features/steps/provider_stream_conformance.js' ||
    /^(provider|conformance)\/[^/]+_test\.go$/.test(p) || p.startsWith('conformance/provider-stream-testdata/');
  for (const p of Object.keys(o.hashes).filter(p => !oldFiles.has(p))) assert.ok(allowed(p), 'out-of-scope new file: ' + p);
  assert.equal(o.hashes['README.md'], hash(o.current), 'README snapshot mismatch');
  const heading = '## Local status and compatibility\n\n';
  const offset = o.current.indexOf(heading);
  const start = offset + heading.length;
  const end = o.current.indexOf('\n\nProvider/tool/sys bytes', start);
  assert.ok(offset >= 0 && end > start, 'README status section missing');
  assert.equal(o.current.slice(start, end), status, 'README delivery status differs');
  const normalized = o.current.slice(0, start) + baseline.status + o.current.slice(end);
  const hashes = {...o.hashes, 'README.md': hash(normalized)};
  assert.equal(hash(JSON.stringify(baseline.files.map(p => [p, hashes[p]]))), baseline.digest,
    'baseline bytes changed outside the approved README status');
}

function controls(kind) {
  assert.ok(['good', 'bad'].includes(kind));
  const want = {package: 'kogen-loop/control', suite: 'TestControl', tests: ['TestControl/deep']};
  const event = (Action, Test) => ({Package: want.package, Action, ...(Test ? {Test} : {})});
  const frames = [event('start'), event('run', want.suite), event('run', want.tests[0]), event('pass', want.tests[0]), event('pass', want.suite), event('pass')];
  const report = evs => ({status: 0, signal: null, error: null, stdout: evs.map(e => JSON.stringify(e)).join('\n') + '\n', stderr: ''});
  const before = '# Example\n\n## Local status and compatibility\n\nOld status.\n\nProvider/tool/sys bytes stay.\n';
  const status = 'Historical adoption.\n\nCurrent published facts.';
  const baseline = {files: ['README.md', 'provider/wire.go'], status: 'Old status.',
    digest: hash(JSON.stringify([['README.md', hash(before)], ['provider/wire.go', hash('production bytes')]]))};
  const fixture = privateDir(path.join(world(), 'scope-control'));
  privateDir(path.join(fixture, 'provider'));
  for (const [name, content] of Object.entries({'README.md': before.replace('Old status.', status), 'provider/wire.go': 'production bytes', 'provider/new_test.go': 'additive test'})) {
    fs.writeFileSync(path.join(fixture, name), content, {mode: 0o600});
    fs.chmodSync(path.join(fixture, name), 0o600);
  }
  const scope = inspectScope(fixture);
  verifyReport(report(frames), want);
  verifyScope(scope, status, baseline);
  if (kind === 'good') { process.stdout.write('provider-stream observer good\n'); return; }
  const mustReject = fn => {
    let rejected = false;
    try { fn(); } catch (_) { rejected = true; }
    assert.equal(rejected, true, 'observer accepted a broken control');
  };
  for (let i = 0; i < frames.length; i++) mustReject(() => verifyReport(report(frames.filter((_, n) => n !== i)), want));
  for (const action of ['skip', 'fail']) mustReject(() => verifyReport(report([...frames, event(action, want.tests[0])]), want));
  for (const mutation of [
    o => o.status = 1, o => o.signal = 'SIGKILL', o => o.error = 'timeout', o => o.stdout = '',
    o => o.stdout = 'compiler diagnostic\n', o => o.stderr = 'compiler diagnostic\n',
    o => o.stdout += JSON.stringify(event('pass', want.tests[0])) + '\n',
    o => o.stdout = o.stdout.replaceAll('kogen-loop/control', 'kogen-loop/other'),
    o => o.stdout += JSON.stringify(event('run', 'TestUncompleted')) + '\n'
  ]) {
    const bad = structuredClone(report(frames)); mutation(bad);
    mustReject(() => verifyReport(bad, want));
  }
  const changeReadme = (o, text) => { o.current = text; o.hashes['README.md'] = hash(text); };
  for (const mutation of [
    o => o.hashes['provider/wire.go'] = hash('changed production bytes'),
    o => delete o.hashes['provider/wire.go'],
    o => o.hashes['loop/new.go'] = hash('out of scope'),
    o => o.hashes['docs/testing-rules.md'] = hash('out of scope'),
    o => changeReadme(o, before),
    o => changeReadme(o, o.current.replace('Current published facts.', 'New commit is pinned.')),
    o => changeReadme(o, o.current + 'Unrelated README change.\n')
  ]) {
    const bad = structuredClone(scope); mutation(bad);
    mustReject(() => verifyScope(bad, status, baseline));
  }
  // Exercise the actual filesystem reader as well as in-memory observations.
  fs.writeFileSync(path.join(fixture, 'provider/wire.go'), 'changed production bytes', {mode: 0o600});
  mustReject(() => verifyScope(inspectScope(fixture), status, baseline));
  process.stdout.write('provider-stream observer bad rejected\n');
  process.exitCode = 1;
}

function cleanup() {
  if (workspace) fs.rmSync(workspace, {recursive: true, force: true});
}

if (require.main === module) {
  try {
    assert.equal(process.argv[2], '--control');
    controls(process.argv[3]);
  } catch (e) { console.error(e.stack); process.exitCode = 2; }
  finally { cleanup(); }
} else {
  const {Given, When, Then, AfterAll} = require('@cucumber/cucumber');
  Given('the provider-stream Go coverage contract is:', function(text) { this.providerStreamWant = JSON.parse(text); });
  When('I execute the provider-stream coverage with umask {string}', {timeout: 240000}, function(mask) {
    this.providerStreamReport = runTests(this.providerStreamWant, mask);
  });
  Then('every required provider-stream test executes once and passes', function() { verifyReport(this.providerStreamReport, this.providerStreamWant); });
  Then('only additive offline tests and this README status are delivered:', function(text) { verifyScope(inspectScope(), text); });
  AfterAll(cleanup);
}
